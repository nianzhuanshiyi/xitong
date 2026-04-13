- 不要输出"好的，我明白了"等确认性废话，直接给出结果
- 修改代码时只输出变更部分，不要重复输出未修改的代码
- 回答要简洁，不需要解释显而易见的内容

# CLAUDE
写代码时, 避免定义但是未使用的变量 

# 技术架构

1. 基础架构 (Core)

- 框架 : Next.js 14 (使用 App Router 架构)
- 语言 : TypeScript
- 运行环境 : Node.js
2. 前端界面 (Frontend)

- 样式 : Tailwind CSS
- 组件库 : Shadcn UI (基于 Radix UI)
- 图标 : Lucide React
- 主题 : next-themes (支持深色模式)
- 图表 : Recharts
3. 后端与数据库 (Backend & DB)

- ORM : Prisma
- 数据库 :
  - 本地开发： SQLite (使用 schema.prisma )
  - 生产环境： PostgreSQL (使用 schema.postgresql.prisma )
- 认证 : NextAuth.js (集成 Prisma Adapter)
- 校验 : Zod (Schema 验证)
4. AI 与业务工具 (AI & Utilities)

- AI 引擎 :
  - Google Gemini : 使用 @google/generative-ai
  - Anthropic Claude : 通过 claude-client.ts 自定义集成
- 邮件处理 : Imapflow (同步), Mailparser (解析), Nodemailer (发送)
- 文档处理 : pdf-parse , docx , jszip
- 图像处理 : Sharp
5. 开发与部署 (DevOps)

- 构建工具 : Next.js CLI
- Lint : ESLint (使用 eslint-config-next )
- 部署环境 : 支持 Railway (通过 package.json 中的 Prisma 构建脚本可见)