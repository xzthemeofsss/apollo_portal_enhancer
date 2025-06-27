# Apollo YAML 全屏编辑器

<div align="center">

![Version](https://img.shields.io/badge/version-3.8-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

**Apollo 配置中心的全屏 YAML 编辑增强脚本**

</div>

## ✨ 核心功能

- **🖥️ 全屏编辑器** - 摆脱小窗口束缚，享受宽敞的编辑空间
- **🎨 护眼主题** - Everforest Light 主题，专为长时间编辑设计
- **🔍 智能搜索** - Ctrl+F 快速搜索，支持位置导航
- **⚡ 一键保存** - Ctrl+S 保存并自动同步到 Apollo
- **🚀 发布增强** - 优化的 diff 高亮显示，清晰对比配置变更

## 🚀 快速开始

### 1. 安装 Tampermonkey
- [Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
- [Firefox](https://addons.mozilla.org/firefox/addon/tampermonkey/)
- [Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)

### 2. 安装脚本
1. 复制 `apollo-yaml-enhancer.user.js` 文件内容
2. 打开 Tampermonkey 管理面板
3. 点击 "+" 创建新脚本，粘贴代码并保存

### 3. 开始使用
1. 访问你的 Apollo 配置中心
2. 点击任意配置的"修改配置"按钮
3. 享受全屏编辑体验！

## ⚡ 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+S` | 保存并退出 |
| `Ctrl+F` | 打开搜索 |
| `Enter` | 查找下一个 |
| `Shift+Enter` | 查找上一个 |
| `Esc` | 关闭搜索/退出编辑器 |

## 🔧 自定义配置

脚本默认匹配包含 `config.html` 的页面。如需适配其他 Apollo 实例，请修改脚本头部的 `@match` 规则：

```javascript
// @match        http*://your-apollo-domain.com/*
```

## 📸 效果预览

**全屏编辑器界面**
```
┌─────────────────────────────────────────────────────────────┐
│ 🌲 dev / default / application.yml         💾 保存并退出 ❌ 取消 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  server:                                                    │
│    port: 8080                                              │
│                                                             │
│  spring:                                                    │
│    datasource:                                             │
│      url: jdbc:mysql://localhost:3306/db                  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ 字符数: 156 | 行数: 8        Ctrl+S 保存并退出 | Esc 取消  │
└─────────────────────────────────────────────────────────────┘
```

**发布 Diff 显示**
```
📊 变更统计: +3 -1 ~2     ◀ 1/6 ▶     💡 ↑↓/JK 导航

+ spring:
+   profiles:
+     active: dev
- debug: true
~ server:
~   port: 9090
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件