import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";

async function handleHttpProxy(request: Request): Promise<Response> {
  // 记录 HTTP 请求日志（方法、路径、URL）
  const url = new URL(request.url);
  console.log("【HTTP请求】", request.method, url.pathname, url.search); // 关键日志

  const path = url.pathname + url.search;
  const targetUrl = new URL(path, GEMINI_API_BASE).toString();
  const headers = new Headers(request.headers);
  // headers.set("Host", "generativelanguage.googleapis.com");

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.body,
      signal: request.signal,
    });
    return new Response(response.body, { status: response.status, headers: response.headers });
  } catch (error) {
    console.error("HTTP转发错误:", error);
    return new Response("Proxy Error", { status: 500 });
  }
}

function handleWebSocketProxy(request: Request): Response {
  const url = new URL(request.url);
  console.log("【WebSocket请求】", url.pathname, url.search); // 关键日志

  try {
    const [clientWs, serverWs] = Deno.upgradeWebSocket(request);
    const wsPath = url.pathname + url.search;
    const targetWsUrl = `wss://generativelanguage.googleapis.com${wsPath}`;
    const targetWs = new WebSocket(targetWsUrl);

    // 转发逻辑...（同原代码）
    return new Response(null, { status: 101 });
  } catch (error) {
    console.error("WebSocket转发错误:", error);
    return new Response("WebSocket Error", { status: 500 });
  }
}

serve((request) => {
  const isWebSocket = request.headers.get("upgrade")?.toLowerCase() === "websocket";
  return isWebSocket ? handleWebSocketProxy(request) : handleHttpProxy(request);
});
