#!/bin/sh
# hookkit 核心 —— 单一真源。.githooks/{pre-commit,commit-msg,pre-push} 只是薄包装,全部转发到这里。
# 配置:仓库根 .githooks.conf(可选,不写用下面的默认值)。
# 用法:sh .githooks/hooks.sh <hook> [参数]
set -u

if [ $# -lt 1 ]; then
  echo "用法: sh hooks.sh <hook> [参数]  (hook: pre-commit|commit-msg|pre-push)" >&2
  exit 2
fi
hook=$1
shift

# ---------- 默认配置(被 .githooks.conf 覆盖) ----------
commit_types='feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert'
require_scope=0                 # 1 表示 scope 必填
require_lang=any                # any|zh|en ; zh=描述必须含中文且限制标点
branch_protected='main master develop'   # 合法首层分支
branch_prefixes='feature fix chore release hotfix test'   # 合法前缀
no_push='main master'           # 禁止直接推送的分支
forbidden_pattern='(^|/)(\.DS_Store|Thumbs\.db|\.env$|\.env\.[^/]+|.+\.local)$'
extra_checks=''                 # 空格分隔的仓库内检查脚本,会被调用:<path> --staged
skip=''

fail() { echo "hookkit [$hook]: $*" >&2; exit 1; }

repo_root=$(git rev-parse --show-toplevel 2>/dev/null || true)
[ -n "$repo_root" ] || fail "不在 git 仓库中"
cd "$repo_root" || exit 1

if [ -f .githooks.conf ]; then
  # Windows 编辑器可能把配置存成 CRLF,先剥离 \r 再加载,防 shell 报错
  tr -d '\r' < .githooks.conf > ./.githooks.conf.$$
  . ./.githooks.conf.$$
  rm -f ./.githooks.conf.$$
fi

# SKIP 支持:兼容 pre-commit 风格的逗号分隔,也支持空格
if echo "$skip ${SKIP:-}" | tr ', ' ' ' | grep -qw "$hook"; then
  echo "hookkit: SKIP=$hook"
  exit 0
fi

case $hook in
# ============================================================ commit-msg
commit-msg)
  msg_file=${1:-}
  [ -n "$msg_file" ] || fail "缺少提交信息文件(应由 .githooks/commit-msg 调用)"
  subject=$(sed -e '/^[[:space:]]*#/d' -e '/^[[:space:]]*$/d' -e 'q' "$msg_file" 2>/dev/null)
  case $subject in
    Merge\ *) exit 0 ;;
  esac
  [ -n "$subject" ] || fail "提交信息不能为空"
  # 注意:上游用 \(...\)? 包裹 scope,在 macOS BSD grep 下无法解析(所有提交都会被拒);
  # 改为 ERE 标准分组,语义不变(scope 仍可省,charset 里 - 置首避免反向范围)。
  if [ "$require_scope" = 1 ]; then
    scope='(\([-A-Za-z0-9._/]+\))'
  else
    scope='(\([-A-Za-z0-9._/]+\))?'
  fi
  desc='.+'
  [ "$require_lang" = zh ] && desc='.*[一-鿿].*'
  pattern="^($commit_types)$scope(!)?: $desc\$"
  printf '%s\n' "$subject" | LC_ALL=C.UTF-8 grep -Eq "$pattern" \
    || fail "格式不符合: <类型>(<范围>): <描述>;类型=$commit_types;范围$([ "$require_scope" = 1 ] && echo 必填 || echo 可省)"
  if [ "$require_lang" = zh ]; then
    allow_pat='^[-A-Za-z0-9一-鿿 .,/_!:，。！？；：、（）【】《》“”‘’()]+$'
    printf '%s\n' "$subject" | LC_ALL=C.UTF-8 grep -Eq "$allow_pat" \
      || fail "含不允许的字符(只允许中文/英文/数字/空格及 . , / _ ! : - 和中文标点)"
  fi
  echo "hookkit [commit-msg]: 通过"
  ;;

# ============================================================ pre-commit
pre-commit)
  files=$(git diff --cached --name-only --diff-filter=ACMR || true)
  [ -n "$files" ] || exit 0
  errs=$(git diff --cached --check || true)
  errs=$(printf '%s\n' "$errs" | grep -v ': new blank line at EOF\.$' || true)
  [ -z "$errs" ] || fail "暂存区存在行尾空白错误"
  bad=$(printf '%s\n' "$files" | grep -Ev '(^|/)\.env\.example$' | grep -E "$forbidden_pattern" | head -n1 || true)
  [ -z "$bad" ] || fail "禁止提交系统/环境文件: $bad"
  # 内层已打印具体文件名,外层只传播退出码,避免重复报错
  printf '%s\n' "$files" | grep '\.md$' | while read -r f; do
    [ -s "$f" ] || { echo "hookkit [pre-commit]: Markdown 不能为空: $f" >&2; exit 1; }
  done || exit 1
  for c in $extra_checks; do
    "$c" --staged || fail "额外检查未通过: $c"
  done
  echo "hookkit [pre-commit]: 通过"
  ;;

# ============================================================ pre-push
pre-push)
  branch=${1:-$(git branch --show-current 2>/dev/null || true)}
  [ -n "$branch" ] || fail "处于 detached HEAD,无法检查分支"
  ok=0
  case " $branch_protected " in
    *" $branch "*) ok=1 ;;
  esac
  case " $branch_prefixes " in
    *" ${branch%%/*} "*) printf '%s' "${branch#*/}" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]*$' && ok=1 ;;
  esac
  [ "$ok" = 1 ] || fail "分支命名不规范: $branch(允许:$branch_protected 或 <prefix>/<名称>,prefix∈$branch_prefixes)"
  case " $no_push " in
    *" $branch "*) fail "禁止直接推送分支: $branch" ;;
  esac
  echo "hookkit [pre-push]: 通过"
  ;;
esac
