# DATABASE.md — Persona Theater Engine 数据库说明

## 1. 数据库定义

本项目使用 **文件型数据库（file-based database）**。

存在两层：

### Source（唯一真实数据库）

/database/

### Publish（网页读取副本）

/docs/database/

---

## 2. 核心规则（非常重要）

1. 所有数据修改只发生在：
   → /database/

2. /docs/database/：

   * 禁止手动编辑
   * 仅作为网页读取副本

3. /docs/database/ 必须由 /database/ 同步生成

---

## 3. Claude 与 Codex 分工

### Claude（应用层）

负责：

* UI / Theater mode
* 交互逻辑
* API 调用
* 数据消费

不得：

* 修改数据库结构
* 修改 schema
* 批量改 persona

---

### Codex（数据库层）

负责：

* 创建 persona
* JSON 结构统一
* schema 对齐
* 数据清洗
* manifest
* migrations

只能操作：
/database/

---

## 4. persona 文件结构

每个 persona：

ARCH01.md   → 人类可读
ARCH01.json → 程序读取

必须：

* 同名前缀
* 一一对应

---

## 5. Source of Truth

* 内容来源：.md
* 运行数据：.json
* 结构约束：schema

---

## 6. 命名规则

统一：

"id": "ARCH01"

禁止混用：

* ARCH01
* ARCH-01

---

## 7. 数据库结构

/database/
├── personas/
├── schemas/
├── manifests/
├── tools/
└── migrations/

---

## 8. 同步机制

/database/ → /docs/database/

这是一个单向同步：

source → publish

---

## 9. Claude 使用规则

Claude 必须：

* 从 /docs/database/ 读取
* 使用 JSON，不解析 md
* 不写死 persona

---

## 10. Codex 使用规则

Codex 必须：

* 只改 /database/
* 不触碰 src/
* 不改 UI / API

---

## 11. 一句话原则

database 是系统核心数据层
Codex 管理它
Claude 使用它
docs/database 是它的镜像

