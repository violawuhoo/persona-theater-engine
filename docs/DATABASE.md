# DATABASE.md — Persona Theater Engine 数据库说明

## 1. 数据库是什么

本项目数据库为 **文件型数据库（file-based database）**，位于：

/database/personas/

每个 persona 由：

* `.md`（人类可读）
* `.json`（程序可读）

构成。

---

## 2. 职责划分

### Claude（应用层）

负责：

* UI / 交互 / Theater mode
* API 调用
* 运行时逻辑
* 数据消费

不得：

* 修改数据库结构
* 修改 schema
* 批量改 persona 文件

---

### Codex（数据库层）

负责：

* 创建 persona
* 统一 JSON 结构
* 数据清洗
* schema 对齐
* 命名统一
* 版本管理
* manifest / validator

不得：

* 修改 src/
* 修改 UI / 交互逻辑
* 修改 API 调用代码

---

## 3. 数据结构原则

每个 persona：

ARCH01.md
ARCH01.json

规则：

* 文件名前缀必须一致
* 一一对应
* JSON 为运行时唯一数据源

---

## 4. Source of Truth

* 内容语义：`.md`
* 运行数据：`.json`
* 结构规范：`schema`

禁止在运行时代码中“猜测字段”。

---

## 5. 命名规则

统一：

"id": "ARCH01"

禁止混用：

* ARCH01
* ARCH-01

只能选一种（推荐 ARCH01）。

---

## 6. JSON 使用原则

必须满足：

* 结构稳定
* 字段固定
* 类型明确
* 不依赖自然语言解析

---

## 7. Claude 使用数据库方式

Claude 必须：

* 从 `/database/personas/` 读取 JSON
* 不写死 persona 内容
* 按字段渲染 UI

如果字段不够：
→ 提需求，不要改 schema

---

## 8. Codex 工作方式

Codex 只能操作：

/database/

包括：

* personas
* schemas
* manifests
* tools

---

## 9. 推荐后续结构

/database/
├── personas/
├── schemas/
├── manifests/
├── tools/
└── migrations/

---

## 10. 一句话原则

数据库是稳定层。
Claude 使用它。
Codex 管理它。
两者通过 schema 对接。
