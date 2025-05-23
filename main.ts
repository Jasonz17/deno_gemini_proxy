import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

// Google Gemini API 基础地址
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";

// 处理 HTTP 请求（支持文件流透传）
async function handleHttpProxy(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const path = url.pathname + url.search;
    const targetUrl = new URL(path, GEMINI_API_BASE).toString();
    const headers = new Headers(request.headers);

    // 打印请求日志（关键：查看 Content-Type 和路径）
    console.log(`【HTTP请求】${request.method} ${path}`);
    console.log(`【Content-Type】${headers.get("content-type") || "无"}`);

    // 透传请求体（支持二进制文件流）
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.body, // 直接转发原始请求体（包括文件二进制数据）
      signal: request.signal,
    });

    // 打印响应状态（调试用）
    console.log(`【响应状态】${response.status}`);
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error) {
    console.error("HTTP转发错误:", error);
    return new Response("Proxy Error", { status: 500 });
  }
}

// 处理 WebSocket 请求（可选，若Cherry Studio不使用WebSocket可移除）
function handleWebSocketProxy(request: Request): Response {
  try {
    const url = new URL(request.url);
    console.log(`【WebSocket请求】${url.pathname}`);

    const [clientWs, serverWs] = Deno.upgradeWebSocket(request);
    const targetWsUrl = `wss://generativelanguage.googleapis.com${url.pathname}`;
    const targetWs = new WebSocket(targetWsUrl);

    // 透传WebSocket消息（二进制/文本）
    clientWs.onmessage = (event) => targetWs.send(event.data);
    targetWs.onmessage = (event) => clientWs.send(event.data);
    
    // 同步关闭连接
    ["close", "error"].forEach((event) => {
      clientWs.addEventListener(event, () => targetWs.close());
      targetWs.addEventListener(event, () => clientWs.close());
    });

    return new Response(null, { status: 101 });
  } catch (error) {
    console.error("WebSocket转发错误:", error);
    return new Response("WebSocket Error", { status: 500 });
  }
}

// 主服务入口
serve((request) => {
  const isWebSocket = request.headers.get("upgrade")?.toLowerCase() === "websocket";
  return isWebSocket ? handleWebSocketProxy(request) : handleHttpProxy(request);
});
