/** 类型声明补齐：无 @types 的 markdown-it 插件 */

declare module "markdown-it-task-lists" {
  import MarkdownIt from "markdown-it";
  interface TaskListsOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }
  const plugin: (md: MarkdownIt, options?: TaskListsOptions) => void;
  export default plugin;
}

declare module "markdown-it-mark" {
  import MarkdownIt from "markdown-it";
  interface MarkOptions {
    double?: boolean;
  }
  const plugin: (md: MarkdownIt, options?: MarkOptions) => void;
  export default plugin;
}
