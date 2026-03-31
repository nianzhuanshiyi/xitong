# 项目规则

## 构建验证（必须遵守）

每次 commit + push 之前，**必须**先运行以下命令确认 0 error：

```bash
npx prisma generate --schema=prisma/schema.postgresql.prisma && npx next build
```

- 如果 build 有 error（包括 ESLint 错误），**先修复再 push**
- 绝对不要在 build 未通过的情况下推送代码
- 这条规则没有例外
