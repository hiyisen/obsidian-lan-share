/* lan-share: 客户端交互 —— 侧栏/大纲折叠、文件夹树折叠（无外部依赖，同源提供） */
(function () {
  "use strict";
  var STORE_KEY = "lanshare-ui";
  var body = document.body;

  function remember() {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          sidebar: body.classList.contains("sidebar-collapsed"),
          outline: body.classList.contains("outline-collapsed"),
        }),
      );
    } catch (e) {
      /* 隐私模式等场景静默忽略 */
    }
  }

  function restore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var state = JSON.parse(raw);
      if (typeof state.sidebar === "boolean" && state.sidebar) body.classList.add("sidebar-collapsed");
      if (typeof state.outline === "boolean" && state.outline) body.classList.add("outline-collapsed");
    } catch (e) {
      /* 忽略损坏的存储 */
    }
  }

  document.addEventListener("click", function (ev) {
    if (!(ev.target instanceof Element)) return;

    // 折叠 / 展开整栏（侧栏、大纲）
    var toggle = ev.target.closest("[data-toggle]");
    if (toggle) {
      var which = toggle.getAttribute("data-toggle");
      body.classList.toggle(which + "-collapsed");
      remember();
      return;
    }

    // 折叠 / 展开某个文件夹子树
    var fold = ev.target.closest("[data-fold]");
    if (fold) {
      var row = fold.closest(".folder-row");
      if (row) {
        var children = row.nextElementSibling;
        if (children && children.classList.contains("tree-children")) {
          children.hidden = !children.hidden;
          fold.classList.toggle("folded", children.hidden);
          remember();
        }
      }
      return;
    }
  });

  restore();
})();
