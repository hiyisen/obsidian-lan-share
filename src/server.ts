import { createServer, Server, IncomingMessage, ServerResponse } from "http";
import type { RouterDeps } from "./types.ts";
import { Router, RequestLike } from "./render/router.ts";
import type { HttpResponse } from "./types.ts";

/**
 * Node http 服务器：只做薄适配（req/res ⇄ Router 纯函数），
 * 真正逻辑都在 Router 里（可脱离 Node 测试）。
 */
export function startServer(deps: RouterDeps, port: number, onListen?: (address: string) => void): Promise<Server> {
  const router = new Router(deps);

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    handleOnce(req, res, router);
  });

  return new Promise((resolve, reject) => {
    server.once("error", (e) => {
      reject(e);
    });
    server.listen(port, "0.0.0.0", () => {
      const addr = server.address();
      const address = typeof addr === "object" && addr ? "0.0.0.0:" + addr.port : "unknown";
      onListen?.(address);
      resolve(server);
    });
  });
}

async function handleOnce(req: IncomingMessage, res: ServerResponse, router: Router): Promise<void> {
  if (!req.url) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Bad Request");
    return;
  }
  let u: URL;
  try {
    u = new URL(req.url, "http://localhost");
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Bad Request");
    return;
  }

  // 依次解码路径段（保留嵌套结构）
  let pathname: string;
  try {
    pathname = decodePath(u.pathname);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Bad Request");
    return;
  }

  const rl: RequestLike = {
    method: req.method || "GET",
    pathname,
    query: u.searchParams,
  };

  const resp: HttpResponse = await router.handle(rl);

  const headers: Record<string, string> = { ...resp.headers };
  if (resp.body !== undefined) headers["Content-Length"] = String(Buffer.byteLength(resp.body));
  if (resp.binary !== undefined) headers["Content-Length"] = String(resp.binary.byteLength);

  const isHead = (req.method || "GET").toUpperCase() === "HEAD";
  res.writeHead(resp.status, headers);
  if (isHead) {
    res.end();
    return;
  }
  if (resp.binary !== undefined) {
    res.end(Buffer.from(resp.binary));
  } else {
    res.end(resp.body ?? "");
  }
}

/** 仅解码 URL 编码（不触发任何路径规范化——那由 Router 层做），拒绝非法编码 */
function decodePath(p: string): string {
  return p.split("/").map(decodeURIComponent).join("/");
}
