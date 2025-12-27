# AI 文档助手

一个跨平台的 AI 文档助手应用程序，允许用户上传文档并使用 AI 询问文档内容相关的问题。

## 概述

本项目包括：

- **后端**: Node.js 服务器，用于处理文档处理和 AI 集成
- **前端**: Flutter 应用程序，支持多平台（Web、Android、iOS、Windows、macOS、Linux）- 可构建为静态 Web 文件由后端提供服务

## 功能

- 上传文档（PDF、文本文件）
- 使用 AI 询问文档内容相关的问题
- 跨平台支持：
  - Web 应用程序
  - 移动应用程序（Android/iOS）
  - 桌面应用程序（Windows/macOS/Linux）

## 架构

```
┌───────────────────────────────────────────
│            前端 (Flutter)
├───────────────────────────────────────────
│  Web  │ Mobile │ Desktop │ Single Codebase
│ (PWA) │ (APK)  │ (EXE)   │
└───────────────────────────────────────────
                    │
                    ▼
┌───────────────────────────────────────────
│             后端 (Node.js)
│  - 文档上传和处理
│  - AI API 集成
│  - 提供Web静态文件服务
│  - RESTful API 端点
└───────────────────────────────────────────
```

## 环境要求

### 后端

- Node.js (v14 或更高版本)
- npm 或 yarn

### 前端（用于构建前端应用）

- Flutter SDK (v3.0 或更高版本)
- Dart SDK (v2.17 或更高版本)

## 安装说明

### 后端设置

1. 进入项目根目录:

   ```bash
   cd AI_Document_Assistant
   ```

2. 安装依赖:

   ```bash
   npm install
   ```

3. 启动后端服务器:

   ```bash
   npm start
   ```

4. 开发模式启动:
   ```bash
   npm run dev
   ```

### 前端设置（用于 Web 访问）

如果需要 Web 前端访问，请执行以下步骤：

1. 进入前端目录:

   ```bash
   cd frontend
   ```

2. 获取 Flutter 依赖:

   ```bash
   flutter pub get
   ```

3. 构建 Web 应用:

   ```bash
   flutter build web
   ```

4. 构建完成后，返回根目录启动服务器，Web 应用将自动通过 `http://<服务器IP>:2070` 提供服务

### 前端构建后访问方式

构建前端 Web 应用后，只需启动后端服务 (`npm start`)，任何人都可以通过 `http://<服务器IP>:2070` 访问 Web 应用。

### 移动端 (APK)

- 构建 APK: `cd frontend && flutter build apk --release`
- 生成的 APK 位于 `frontend/build/app/outputs/flutter-apk/`
- 可通过 USB 安装到 Android 设备或发布到应用商店

### 桌面端 (EXE)

- 构建 Windows 可执行文件: `cd frontend && flutter build windows --release`
- 生成的 EXE 位于 `frontend/build/windows/runner/Release/`
- 可直接在 Windows 系统运行

## 部署到远程服务器

### 1. 准备阶段（本地机器）

在本地机器上完成以下步骤：

1. 进入前端目录:

   ```bash
   cd frontend
   ```

2. 获取 Flutter 依赖:

   ```bash
   flutter pub get
   ```

3. 构建 Web 应用（**必须先构建 Web 应用才能通过浏览器访问**）:

   ```bash
   flutter build web
   ```

4. 将整个项目（包括构建好的前端文件）上传到服务器

### 2. 服务器部署

在远程服务器上执行以下步骤：

1. 确保服务器已安装 Node.js 和 npm
2. 进入项目目录
3. 安装依赖:

   ```bash
   npm install
   ```

4. 启动服务器:

   ```bash
   npm start
   ```

5. 现在远程计算机可以通过 `http://<服务器IP>:2070` 访问 Web 前端和后端 API

> **注意**: 如果跳过构建 Web 应用的步骤，访问服务器将只显示 "AI Document Assistant API"，而不是完整的 Flutter 界面。

### 使用 PM2 进行进程管理（可选）

1. 安装 PM2:

   ```bash
   npm install -g pm2
   ```

2. 使用 PM2 启动服务:

   ```bash
   pm2 start server.js --name ai-document-assistant --cwd ./backend
   ```

3. 设置开机自启:

   ```bash
   pm2 startup
   pm2 save
   ```

### Docker 部署

1. 构建 Docker 镜像:
   ```bash
   docker build -t ai-document-assistant-backend .
   ```
2. 运行容器:
   ```bash
   docker run -d -p 2070:2070 --env-file .env ai-document-assistant-backend
   ```

## API 端点

- `GET /` - 健康检查或提供 Web 前端
- `POST /api/upload` - 上传文档
- `POST /api/ask` - 询问文档相关问题

## 技术栈

- **后端**: Node.js
- **前端**: Flutter, Dart
- **数据库**: MongoDB
- **部署**: Docker (后端), Flutter build (前端)
