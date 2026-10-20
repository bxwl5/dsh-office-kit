# dsh-office-suite

[![CI][ci-src]][ci-href]
[![DSH][dsh-src]][dsh-href]
[![License][license-src]][license-href]

为 DeepSeek Harness (DSH) 提供本地 Office 文档能力：Word、PDF、演示文稿与电子表格，通过 `/` 菜单和引用 Chip 驱动。

* **系统要求**：DSH $\ge$ `0.2.1-rc.2`；Node.js $\ge$ `20`；Python `3.10`–`3.13`。

---

## 能力

| 命令 | 格式 | 创建 / 读取 / 编辑 | 渲染 | 其他 |
| --- | --- | --- | --- | --- |
| `/documents` | DOCX | 支持 | Word、LibreOffice | 表格、图片、公式、页眉页脚 |
| `/pdf` | PDF | 支持 | PyMuPDF | 合并、旋转、删页、元数据 |
| `/presentations` | PPTX | 支持 | PowerPoint、LibreOffice | 文本、项目符号、表格、图表、图片 |
| `/spreadsheets` | XLSX | 支持 | Excel、LibreOffice | 公式、样式、图表、冻结窗格、重算 |

输入 `/` 打开「办公」菜单，每项都有独立图标和友好名称。回车插入引用 Chip，内部标识为 `documents`、`pdf`、`presentations`、`spreadsheets`，支持草稿持久化与会话恢复；点击 Chip 在右侧边栏打开对应技能，历史消息中显示同款格式图标。

插件包含四个技能 `office-documents`、`office-pdf`、`office-presentations`、`office-spreadsheets`，以及宿主工具 `office_status`（报告已验证的 Python、依赖包、CLI 与可用渲染器）。

菜单与 Chip 图标来自 [Gravity UI Icons](https://github.com/gravity-ui/icons)（MIT），SVG 与许可证见 [`assets/icons`](assets/icons)。

---

## 安装

```bash
# npm 发布后
dsh plugin add dsh-office-suite

# 或本地目录
dsh plugin add /absolute/path/to/dsh-office-suite
```

安装后在 **设置 → 插件** 中启用。`postinstall` 会检测 Python：

* Windows 上没有兼容 Python 时，下载官方 Python 3.12.10，校验 Authenticode 签名，安装到 `%LOCALAPPDATA%\Programs\Python\Python312`，再创建独立 venv 并验证全部依赖导入。
* macOS / Linux 只验证现有 Python，不自动下载。
* 跳过：`DSH_OFFICE_SKIP_POSTINSTALL=1`；CI 强制：`DSH_OFFICE_POSTINSTALL=1`；重建：`pnpm rebuild dsh-office-suite`。

若受限环境无法写入用户 `PATH`，安装器会明确告警，不会假报成功。宿主和技能读取配置中的解释器绝对路径，不依赖 `PATH`。

---

## 使用

1. 在输入框键入 `/`，选择 **文档**、**PDF 文档**、**演示文稿** 或 **电子表格**。
2. 回车插入 Chip，然后描述任务。
3. Agent 调用 `office_status`，加载对应技能，写 JSON spec，用绝对路径 Python 调用内置 CLI；有渲染器时渲染 PNG 并做视觉检查。

### 直接使用 CLI

```bash
"C:\path\to\python.exe" "C:\path\to\office_cli.py" docx create \
  --spec report.json --out report.docx

"C:\path\to\python.exe" "C:\path\to\office_cli.py" xlsx read \
  --input workbook.xlsx --data-only
```

命令：`status`；`docx|pdf|pptx|xlsx create|read|edit|render`；`xlsx recalc`。参数：`--spec`、`--out`、`--input`、`--out-dir`、`--dpi`、`--json-out`、`--data-only`。spec 与编辑结构见 [`assets/skills`](assets/skills) 和 [CAPABILITY.md](CAPABILITY.md)。

---

## 配置

* 配置：`%APPDATA%\dsh-office-suite\config.json`（Windows）、`~/Library/Application Support/dsh-office-suite/config.json`（macOS）、`$XDG_CONFIG_HOME/dsh-office-suite/config.json`（Linux）。
* `DSH_OFFICE_PYTHON` 可覆盖宿主与 `postinstall` 的解释器发现。
* 配置记录 `python`、`basePython`、`pythonVersion`、`pluginVersion`、`updatedAt` 与导入校验结果；损坏的配置会被跳过并回退到自动发现。

---

## 已知限制

不支持 Google Docs / Slides / Sheets 或任何远程编辑；不内置 Codex `@oai/artifact-tool`；不提供 OCR、PDF 表单填写/签名、DOCX 批注/修订/目录/水印、PPTX 动画/备注/模板、XLSX 数据透视表/宏/数据验证/条件格式。

本地文件不会被冒充为远程文档。完整能力追踪与未支持清单见 [CAPABILITY.md](CAPABILITY.md)。

---

## 开发

```bash
pnpm install
pnpm run lint --fix
pnpm run typecheck
pnpm run test -- --run
pnpm run build
```

集成测试在含中文和空格的临时目录中创建文件；缺少兼容 Python 时跳过 Python 用例，API 快照与功能注册测试仍会运行。检测到 Word 或 LibreOffice 时执行渲染测试。

---

* **测试情况**：2026-10-20，14 个用例通过；lint、类型检查、构建通过；CI（Node 22/24/26，Ubuntu + Windows）7 个 job 全部通过。
* **未验证项**：Chip 插入、跨会话恢复与右侧边栏预览尚未在运行中的 GUI 手动验证；npm 包尚未发布。

---

## 许可证

MIT

第三方声明见 [`assets/icons/LICENSE`](assets/icons/LICENSE)。

<!-- Badges -->

[ci-src]: https://github.com/hairyf/dsh-office-suite/actions/workflows/ci.yml/badge.svg
[ci-href]: https://github.com/hairyf/dsh-office-suite/actions/workflows/ci.yml
[dsh-src]: https://img.shields.io/badge/DSH-0.2.1--rc.2-080f12?style=flat&colorA=080f12&colorB=1fa669
[dsh-href]: https://github.com/deepseek-ai/deepseek-harness
[license-src]: https://img.shields.io/github/license/hairyf/dsh-office-suite.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/hairyf/dsh-office-suite/blob/main/LICENSE.md
