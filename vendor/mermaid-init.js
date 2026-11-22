/* lan-share: 浏览器端初始化 mermaid（安全模式：不执行笔记内脚本） */
(function () {
  "use strict";
  function init() {
    if (!window.mermaid) {
      console.warn("[lan-share] mermaid 未加载");
      return;
    }
    window.mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "default",
      fontFamily: "sans-serif",
    });
    // 页面加载后渲染所有 <pre class="mermaid">
    requestAnimationFrame(function () {
      window.mermaid
        .run({ querySelector: ".mermaid" })
        .then(function () {
          /* 渲染完成 */
        })
        .catch(function (e) {
          console.error("[lan-share] mermaid 渲染失败", e);
        });
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
