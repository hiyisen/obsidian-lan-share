import MarkdownIt from "markdown-it";
import MarkdownItTaskLists from "markdown-it-task-lists";
import MarkdownItMark from "markdown-it-mark";
import MarkdownItAnchor from "markdown-it-anchor";

/**
 * 渲染依赖：由 router 注入，负责 wikilink/嵌入解析与可见 URL 生成。
 * 全部异步，因为 Obsidian 的链接解析是异步的（metadataCache）。
 */
export interface RenderDeps {
  /** 将 "[[xxx]]" 的 linktext（已剥离别名/锚点）解析为 vault 绝对路径；解析不到返回 null */
  resolveLink(linktext: string, sourcePath: string): Promise<string | null>;
  /** 生成附件访问 URL（带令牌） */
  assetUrl(path: string): string;
  /** 生成笔记页 URL（带令牌） */
  noteUrl(path: string): string;
  /** 目标笔记是否在分享集内 */
  isVisible(path: string): boolean;
}

/** 占位符编号 -> 原始 linktext */
interface PendingLink {
  raw: string;
  embedded: boolean;
}

const PLACEHOLDER = (n: number) => `\u0000LANSHARE_${n}\u0000`;

/**
 * 将 Obsidian 笔记文本渲染为 HTML。
 * 流程：markdown-it 同步渲染时把 wikilink/嵌入替换为唯一占位符（fenced code 内的不参与，
 * 由 inline rule 天然保护），再异步解析全部链接，最后把占位符替换为真实 HTML。
 */
export async function renderNoteMarkdown(src: string, sourcePath: string, deps: RenderDeps): Promise<string> {
  const pending: PendingLink[] = [];
  const md = buildParser(pending);

  const stripped = stripFrontmatter(src);
  let html = md.render(stripped);

  // 异步解析所有待处理链接
  const replacements = new Map<number, string>();
  await Promise.all(
    pending.map(async (p, i) => {
      replacements.set(i, await renderWiki(p, sourcePath, deps));
    }),
  );

  for (const [n, htmlSnippet] of replacements) {
    html = html.split(PLACEHOLDER(n)).join(htmlSnippet);
  }
  return html;
}

/** 构建 markdown-it 实例并注册 wikilink inline rule */
function buildParser(pending: PendingLink[]): MarkdownIt {
  const md = new MarkdownIt({
    html: false, // 笔记内原生 HTML 一律转义（避免恶意脚本在朋友浏览器执行）
    linkify: false,
    breaks: true, // 软换行渲染为 <br>，贴近 Obsidian 预览
    typographer: false,
  });

  md.use(MarkdownItAnchor, { slugify: (s: string) => slugify(s) });
  md.use(MarkdownItTaskLists, { label: true, enabled: false });
  md.use(MarkdownItMark);

  // 自定义 fence：mermaid 代码块 → <pre class="mermaid">（内容转义，浏览器端渲染）
  const defaultFence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const lang = (token.info || "").trim().split(/\s+/)[0];
    if (lang === "mermaid") {
      return `<pre class="mermaid">${escapeHtml(token.content)}</pre>`;
    }
    return defaultFence(tokens, idx, options, env, self);
  };

  // wikilink / 嵌入（![[...]]）内联规则
  md.inline.ruler.before("link", "obsidian_wikilink", (state, silent) => {
    const pos = state.pos;
    const src = state.src;

    // ![[...]] 或 [[...]] 统一扫描
    let scan = pos;
    if (src[scan] === "!") scan++; // 嵌入标记（可选）
    if (src[scan] !== "[" || src[scan + 1] !== "[") return false;
    const embedded = scan - pos === 1;
    const start = scan + 2;

    const end = src.indexOf("]]", start);
    if (end === -1) return false;

    if (silent) return true;

    const raw = src.slice(start, end).trim();
    if (!raw) return false;

    const n = pending.length;
    pending.push({ raw, embedded });
    const token = state.push("lanshare_placeholder", "text", 0);
    token.content = PLACEHOLDER(n);
    state.pos = end + 2;
    return true;
  });

  // 占位符按文本渲染
  md.renderer.rules.lanshare_placeholder = (tokens, idx) => escapeHtml(tokens[idx].content);
  return md;
}

/** 删除 YAML frontmatter */
function stripFrontmatter(src: string): string {
  const m = src.match(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
  if (m) return src.slice(m[0].length);
  return src;
}

/** 渲染单个 wiki 链接（非嵌入 / 嵌入图片 / 嵌入笔记） */
async function renderWiki(p: PendingLink, sourcePath: string, deps: RenderDeps): Promise<string> {
  // 拆分 display 别名别名：[[target|alias]]，别名可能是锚点形式
  let target = p.raw;
  let alias = "";
  const bar = target.lastIndexOf("|");
  if (bar !== -1) {
    alias = target.slice(bar + 1).trim();
    target = target.slice(0, bar).trim();
  }

  // 锚点拆分：[[target#heading]] / [[target#^block]]
  let anchor = "";
  const hash = target.indexOf("#");
  if (hash !== -1) {
    anchor = target.slice(hash + 1);
    target = target.slice(0, hash).trim();
  }

  // Obsidian 允许在同库内按文件名/无扩展名引用；交给 resolveLink 处理
  const resolved = await deps.resolveLink(target, sourcePath);

  const display = alias || anchor ? (alias || anchor) : target;
  const safeDisplay = escapeHtml(display);

  if (p.embedded) {
    // 嵌入
    if (!resolved) {
      // 嵌入了不存在的资源：保留为文本，不生成死链
      return `![[${escapeHtml(p.raw)}]]`;
    }
    const ext = (resolved.split(".").pop() || "").toLowerCase();
    const mediaExts = ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "avif", "pdf", "mp3", "wav", "mp4", "webm", "mov"];
    if (mediaExts.includes(ext)) {
      if (ext === "svg") {
        // svg 作为图片渲染（CSP img-src self）
        return `<img src="${escapeHtml(deps.assetUrl(resolved))}" alt="${safeDisplay}" />`;
      }
      return `<img src="${escapeHtml(deps.assetUrl(resolved))}" alt="${safeDisplay}" />`;
    }
    // 嵌入笔记：渲染成链接
    return embeddedNoteLink(resolved, safeDisplay, deps);
  }

  // 普通 wikilink
  if (!resolved) {
    // 未知目标：如果库里确实没这个概念，保险起见仍显示文本
    return `[[${safeDisplay}]]`;
  }
  if (!deps.isVisible(resolved)) {
    // 目标存在但不在分享集：显示为纯文本，避免泄漏库结构
    return escapeHtml(display);
  }
  const href = deps.noteUrl(resolved) + (anchor ? "#" + slugify(anchor) : "");
  return `<a class="internal-link" href="${escapeHtml(href)}">${safeDisplay}</a>`;
}

function embeddedNoteLink(resolved: string, safeDisplay: string, deps: RenderDeps): string {
  if (!deps.isVisible(resolved)) return `![[${safeDisplay}]]`;
  const href = deps.noteUrl(resolved);
  return `<a class="internal-link embed" href="${escapeHtml(href)}">${safeDisplay}</a>`;
}

/** 简化的 slug：保留中文与字母数字，空格转 - （与 Obsidian 锚点跳转大致兼容） */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 从已渲染 HTML 中提取标题层级（供大纲栏使用） */
export function extractHeadings(html: string): { level: number; text: string; id: string }[] {
  const out: { level: number; text: string; id: string }[] = [];
  // markdown-it-anchor 会给 h1-h6 加 id="..."（可能还有 tabindex 等属性）
  const re = /<h([1-6])[^>]*\sid="([^"]*)"[^>]*>([\s\S]*?)<\/h\1>/g;
  for (const m of html.matchAll(re)) {
    const level = parseInt(m[1], 10);
    const id = m[2];
    const raw = m[3];
    // 去掉内部标签取纯文本
    const text = raw.replace(/<[^>]+>/g, "").trim();
    if (text) out.push({ level, text, id });
  }
  return out;
}
