999562.xyz
> A personal blog about design, technology, and life.
999562.xyz 是一个面向个人长期使用的品牌站、作品集与轻量博客，主要用于记录设计、技术与生活，分享产品思考、项目实践、学习记录与个人作品。
项目定位
这个项目不是传统的数据库型 CMS，也没有独立后台服务器。
文章、图片、站点配置等内容直接保存在 GitHub 仓库中；网站前台通过 GitHub App 获得受控写入权限，发布内容后由部署平台自动重新构建并更新网站。
核心链路：
```text
网站前台编辑
→ GitHub App 授权
→ 写入 GitHub 仓库
→ main 分支产生 Commit
→ EdgeOne 自动构建
→ 正式网站更新
```
当前站点
正式域名：https://www.999562.xyz
GitHub 仓库：`zourichao/2026-blog-public`
默认分支：`main`
当前生产平台：Tencent EdgeOne
默认作者：`zourichao`
当前搜索引擎收录：关闭
搜索引擎收录由以下文件集中控制：
```text
src/config/site.ts
```
当前配置：
```ts
export const SEARCH_ENGINE_INDEXING_ENABLED = false
```
正式开放收录前，需要同时确认页面 Metadata、robots、Sitemap 和站长平台配置。
主要功能
Bento 风格卡片首页
毛玻璃与动态背景
响应式桌面端和移动端布局
Markdown 文章编辑与预览
图片上传与文章资源管理
GitHub App 驱动的内容发布
文章作者、标签、摘要和日期
RSS Feed
Sitemap
Canonical URL
标准 HTTP 404 页面
PWA 图标与 Manifest
代码高亮
KaTeX 数学公式
文章已读状态
网站前台配置入口
技术栈
前端
Next.js
React
TypeScript
Tailwind CSS
Next.js App Router
Zustand
SWR
Motion
内容与展示
Markdown
Shiki
KaTeX
JSON 配置文件
GitHub 仓库存储
发布与部署
GitHub App
Git
Tencent EdgeOne
OpenNext / Cloudflare 构建兼容能力
内容存储结构
每篇文章使用独立目录保存：
```text
public/blogs/{slug}/
├─ index.md
├─ config.json
└─ 图片资源
```
其中：
```text
public/blogs/{slug}/index.md
```
保存文章正文。
```text
public/blogs/{slug}/config.json
```
保存文章标题、摘要、作者、日期、标签、分类和显示状态等配置。
```text
public/blogs/index.json
```
保存文章总索引。
```text
public/blogs/categories.json
```
保存分类数据。
网站配置
长期站点配置主要保存在：
```text
src/config/site-content.json
```
当前可通过网站配置界面维护的主要字段包括：
导航品牌
SEO 标题
页脚版权
关于我
关于网站
正式域名和搜索引擎收录开关不进入网站配置后台，而是集中保存在：
```text
src/config/site.ts
```
这样可以避免 Canonical、RSS、Sitemap 和 robots 使用不同地址。
GitHub App 内容发布
项目通过 GitHub App 写入文章、图片和配置。
需要配置：
GitHub App
App ID
仓库 Contents 写权限
App 安装范围
Private Key
目标仓库与分支
建议只授权当前仓库：
```text
zourichao/2026-blog-public
```
发布文章时，网站会根据 GitHub App 权限更新仓库内容，并在 `main` 分支生成新的 Commit。
Private Key 安全说明
Private Key 属于敏感凭据，必须妥善保管。
禁止：
上传到 GitHub
写入 README
写入源码
放入 `public` 目录
截图公开
通过聊天、邮件或群聊长期传播
提交到任何公开仓库
丢失后应在 GitHub App 页面删除旧密钥并重新生成。
环境变量
部署平台需要配置以下变量。
变量名	用途	说明
`NEXT_PUBLIC_GITHUB_OWNER`	GitHub 用户名或组织名	当前为 `zourichao`
`NEXT_PUBLIC_GITHUB_REPO`	目标仓库名	当前为 `2026-blog-public`
`NEXT_PUBLIC_GITHUB_BRANCH`	内容写入分支	当前为 `main`
`NEXT_PUBLIC_GITHUB_APP_ID`	GitHub App ID	可进入浏览器代码
`NEXT_PUBLIC_GITHUB_ENCRYPT_KEY`	浏览器侧 PEM 缓存辅助配置	可留空
`BLOG_SLUG_KEY`	文章 Slug 生成相关密钥	仅服务端使用
注意：
```text
NEXT_PUBLIC_ 开头的变量会被打包到浏览器代码中。
```
因此其中不能存放：
GitHub App Private Key
Client Secret
Installation Token
Personal Access Token
其他真正的秘密信息
本地开发
环境要求
建议使用：
Node.js
pnpm
Git
安装依赖
```bash
pnpm install
```
启动开发环境
```bash
pnpm dev
```
Next.js 构建
```bash
pnpm run build
```
OpenNext / Cloudflare 兼容构建
```bash
pnpm run build:cf
```
不要随意执行依赖升级或自动修复命令，尤其是：
```bash
npm audit fix
pnpm update
```
升级前应先建立独立分支并验证构建结果。
EdgeOne 部署
当前生产环境使用 Tencent EdgeOne。
部署链路：
```text
GitHub main 更新
→ EdgeOne 拉取仓库
→ 安装依赖
→ 执行 Next.js 构建
→ 发布新版本
→ www.999562.xyz 更新
```
推荐设置：
GitHub 仓库：`zourichao/2026-blog-public`
生产分支：`main`
正式域名：`www.999562.xyz`
顶级域名：当前不解析
环境变量：在 EdgeOne 项目设置中配置
自动部署：监听 `main`
修改环境变量后，需要重新部署，已有构建不会自动读取新变量。
发布文章后的更新机制
网站提示发布成功，只代表仓库写入成功。
完整过程是：
```text
前台提交文章
→ GitHub 产生 Commit
→ EdgeOne 检测 main 更新
→ 开始构建
→ 构建成功并发布
→ 正式网站内容更新
```
发布后应等待部署平台完成构建，再刷新正式网站。
SEO 与站点地址
正式站点 Origin 集中定义在：
```text
src/config/site.ts
```
当前地址：
```ts
https://www.999562.xyz
```
以下功能统一使用该地址：
Metadata Base
Canonical URL
Open Graph URL
RSS
Sitemap
robots 中的 Sitemap 地址
当前搜索引擎收录处于关闭状态：
```text
noindex, nofollow
robots.txt: Disallow: /
Sitemap: 空 URL 集合
```
开放收录前，应先确认正式内容、站长平台、域名解析和备案展示均已完成。
404 页面
项目已统一处理普通不存在页面和已删除文章。
例如：
```text
/blog/deploy-test
```
会返回真实 HTTP 404，并显示统一中文页面：
页面不存在
返回首页
查看文章
不会使用 200 状态展示伪错误页面，也不会直接跳转到首页。
主要目录
```text
public/
├─ blogs/                 # 文章、配置和文章图片
├─ images/                # 公共图片
├─ pwa/                   # PWA 图标
└─ manifest.json

src/
├─ app/                   # Next.js App Router 页面与路由
├─ components/            # 公共组件
├─ config/                # 站点配置
├─ hooks/                 # React Hooks
├─ layout/                # 页面布局
├─ lib/                   # 公共逻辑
└─ styles/                # 全局样式
```
重点文件：
```text
src/config/site-content.json
```
站点文案和可配置内容。
```text
src/config/site.ts
```
正式域名与搜索引擎收录开关。
```text
src/consts.ts
```
GitHub 仓库相关基础配置。
```text
src/app/write/
```
文章编辑与发布流程。
```text
src/app/rss.xml/route.ts
```
RSS Feed。
```text
src/app/sitemap.ts
```
Sitemap。
```text
src/app/robots.ts
```
robots.txt。
```text
src/app/not-found.tsx
```
统一 404 页面。
Git 工作流
日常修改建议使用独立分支：
```bash
git switch -c feature/your-change
```
完成后：
```text
修改代码
→ 本地检查
→ 本地构建
→ Commit
→ Push 分支
→ 创建 Pull Request
→ 审核
→ 合并 main
→ EdgeOne 自动部署
```
不要直接在未经检查的情况下向 `main` 强制推送。
禁止使用：
```bash
git push --force
```
除非明确了解其影响并有完整备份。
维护建议
每次较大修改前创建独立分支
重要阶段创建 Git Tag 或备份分支
提交前执行 `git diff --check`
提交前检查修改文件范围
合并前执行 `pnpm run build`
涉及 EdgeOne 兼容性时执行 `pnpm run build:cf`
不把密钥写入仓库
不随意修改锁文件和依赖版本
不机械全仓替换域名
修改正式域名时同步检查 Metadata、RSS、Sitemap 和 robots
删除文章时同步维护文章索引
修改文章字段时同步检查编辑、列表、详情、预览和 RSS
License
本仓库使用 MIT License，具体内容见：
```text
LICENSE
```
