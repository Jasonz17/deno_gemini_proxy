import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

// Google Gemini API 基础地址（固定）
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";

// 处理 HTTP/HTTPS 请求转发
async function handleHttpProxy(request: Request): Promise<Response> {
  try {
    // 解析客户端请求的路径（如 /v1beta/models/gemini-2.0-flash:generateContent）
    const path = new URL(request.url).pathname + new URL(request.url).search;
    // 拼接完整的 Google API 地址
    const targetUrl = new URL(path, GEMINI_API_BASE).toString();
    
    // 复制原始请求头（保留客户端自带的 API 密钥）
    const headers = new Headers(request.headers);
    // 可选：如需替换请求头中的 Host（Deno Deploy 可能需要）
    // headers.set("Host", "generativelanguage.googleapis.com");
    
    // 转发请求到 Google API
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.body,
      // 支持流式响应（重要！）
      signal: request.signal,
    });
    
    // 原样返回 Google 的响应
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error) {
    console.error("HTTP 转发错误:", error);
    return new Response("Proxy Error", { status: 500 });
  }
}

// 处理 WebSocket 请求转发
function handleWebSocketProxy(request: Request): Response {
  try {
    // 升级为 WebSocket 连接
    const [clientWs, serverWs] = Deno.upgradeWebSocket(request);
    // 拼接 Google WebSocket 地址（注意协议为 wss://）
    const wsPath = new URL(request.url).pathname + new URL(request.url).search;
    const targetWsUrl = `wss://generativelanguage.googleapis.com${wsPath}`;
    
    // 创建到 Google 的 WebSocket 连接
    const targetWs = new WebSocket(targetWsUrl);
    
    // 转发客户端消息到 Google
    clientWs.onmessage = (event) => {
      if (targetWs.readyState === WebSocket.OPEN) {
        targetWs.send(event.data);
      }
    };
    
    // 转发 Google 消息到客户端
    targetWs.onmessage = (event) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(event.data);
      }
    };
    
    // 同步关闭连接
    ["close", "error"].forEach((event) => {
      clientWs.addEventListener(event, () => targetWs.close());
      targetWs.addEventListener(event, () => clientWs.close());
    });
    
    return new Response(null, { status: 101 }); // WebSocket 升级响应
  } catch (error) {
    console.error("WebSocket 转发错误:", error);
    return new Response("WebSocket Error", { status: 500 });
  }
}

// 主服务入口：判断请求类型并分流
serve((request) => {
  const isWebSocket = request.headers.get("upgrade")?.toLowerCase() === "websocket";
  return isWebSocket ? handleWebSocketProxy(request) : handleHttpProxy(request);
});