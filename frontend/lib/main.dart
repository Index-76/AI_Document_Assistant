import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:async';
import 'dart:convert';
import 'package:flutter/services.dart' show rootBundle;
import 'utils/logger.dart';
import 'widgets/chat_message_item.dart';
import 'models/chat_message.dart';
import 'widgets/file_section.dart';
import 'package:bitsdojo_window/bitsdojo_window.dart';
import 'widgets/config_dialog.dart';
import 'widgets/tooltip_overlay.dart';
import 'services/api_service.dart';
import 'package:flutter/gestures.dart';

// 配置管理类
class Config {
  static String backendUrl = 'http://localhost:2070/'; // 默认值

  // 从配置文件加载后端URL
  static Future<void> loadConfig() async {
    try {
      // 尝试从assets中加载config.json
      String data = await rootBundle.loadString('assets/config/config.json');
      Map<String, dynamic> config = json.decode(data);
      backendUrl = config['backendUrl'] ?? backendUrl;
    } catch (e) {
      logger.e('无法加载配置文件，使用默认后端地址', e);
    }
  }
}

void main() async {
  // 加载配置
  WidgetsFlutterBinding.ensureInitialized();
  await Config.loadConfig();

  runApp(const MyApp());

  // 设置窗口属性（仅在桌面平台上有效）
  doWhenWindowReady(() {
    final win = appWindow;
    const initialSize = Size(1024, 768);
    win.minSize = initialSize;
    win.size = initialSize;
    win.alignment = Alignment.center;
    win.title = "AI智能文档助手";
    win.show();
  });
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AI智能文档助手',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
        useMaterial3: true,
      ),
      home: const MyHomePage(title: 'AI Document Assistant'),
      // 优化渲染性能
      scrollBehavior: const MaterialScrollBehavior().copyWith(
        dragDevices: {PointerDeviceKind.touch, PointerDeviceKind.mouse},
      ),
    );
  }
}

class MyHomePage extends StatefulWidget {
  const MyHomePage({super.key, required this.title});

  final String title;

  @override
  State<MyHomePage> createState() => _MyHomePageState();
}

class _MyHomePageState extends State<MyHomePage> {
  final List<ChatMessage> _messages = [];
  final TextEditingController _textController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final FocusNode _textFieldFocusNode = FocusNode();
  bool _isLoading = false;

  // 防止重复提交配置的标志位
  bool _isConfiguring = false;

  // 为每个区域创建 GlobalKey
  final GlobalKey<FileSectionState> _waitingSectionKey = GlobalKey();
  final GlobalKey<FileSectionState> _readSectionKey = GlobalKey();
  final GlobalKey<FileSectionState> _templateSectionKey = GlobalKey();
  final GlobalKey<FileSectionState> _resultSectionKey = GlobalKey();

  // 存储已上传文档的内容
  String _currentDocumentContent = '';

  @override
  void initState() {
    super.initState();
    _initConfig().then((_) {
      // 初始化完成后自动开始新对话
      _resetChat();
    });
  }

  Future<void> _initConfig() async {
    // 加载配置
    await Config.loadConfig();
  }

  Future<void> _showConfigDialog() async {
    // 防止重复点击
    if (_isConfiguring) return;

    setState(() {
      _isConfiguring = true;
    });

    await showDialog<bool>(
      context: context,
      builder: (context) {
        return const ConfigDialog();
      },
    );

    // 重置配置状态
    if (mounted) {
      setState(() {
        _isConfiguring = false;
      });
    }
  }

  // 滚动到最新消息
  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _resetChat() {
    setState(() {
      _messages.clear();
      _currentDocumentContent = '';
    });

    // 显示新对话开始的提示消息
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        setState(() {
          _messages.add(
            ChatMessage.ai('您好！我是您的AI智能文档助手，有什么我可以帮您的吗？'),
          );
        });
      }
    });
  }

  // 发送消息
  Future<void> _sendMessage(String text) async {
    if (text.isEmpty) return;

    // 滚动到最新消息
    _scrollToBottom();

    try {
      setState(() {
        _messages.add(ChatMessage.user(text));
        _textController.clear();
        _isLoading = true;
      });

      // 直接调用后端API，让后端处理工具决策和AI响应
      final response = await _callBackendAPI(text, _currentDocumentContent);

      if (response != null) {
        setState(() {
          _messages.add(ChatMessage.ai(response));
        });
      }
    } catch (e, stackTrace) {
      logger.e('处理消息时发生错误', e, stackTrace);
      // 添加错误消息到聊天界面
      if (mounted) {
        setState(() {
          _messages.add(ChatMessage.ai('处理您的请求时发生了错误，请稍后重试。'));
        });
      }
    } finally {
      logger.i('设置加载状态为false');
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
      // AI回复后再次滚动到底部
      _scrollToBottom();

      // 发送消息后焦点回到输入框
      if (mounted) {
        FocusScope.of(context).requestFocus(_textFieldFocusNode);
      }
    }
  }

  // 调用后端API
  Future<String?> _callBackendAPI(String question, String documentText) async {
    try {
      // 使用新的带工具决策的API端点
      final response = await ApiService.chatWithToolDecision(question);
      
      if (response != null) {
        // 检查是否使用了工具
        final toolUsed = response['toolUsed'] ?? false;
        final toolInfo = response['toolInfo'];
        final aiResponse = response['response'];
        
        if (toolUsed && toolInfo != null) {
          logger.i('工具已使用: ${toolInfo['specificToolName']}');
        } else {
          logger.i('未使用工具，直接AI回复');
        }
        
        return aiResponse ?? '未收到后端响应';
      } else {
        logger.e('API调用失败或返回null');
        return '后端服务暂时不可用，请稍后重试';
      }
    } catch (e) {
      logger.e('API调用异常', e);
      return '连接后端服务时发生错误';
    }
  }

  // 从后端获取文档内容
  Future<void> _loadDocumentContent(String filePath) async {
    try {
      final content = await ApiService.getDocumentContent(filePath);
      if (content != null && mounted) {
        setState(() {
          _currentDocumentContent = content;
        });
        logger.i('成功加载文档内容，长度: ${content.length} 字符');
      } else {
        logger.e('无法获取文档内容');
      }
    } catch (e) {
      logger.e('加载文档内容时出错', e);
    }
  }

  void _refreshAllSections() {
    // 调用每个区域的刷新方法
    [
      _waitingSectionKey,
      _readSectionKey,
      _templateSectionKey,
      _resultSectionKey,
    ]
        .map((key) => key.currentState)
        .whereType<FileSectionState>()
        .forEach((state) => state.refreshFiles());
  }

  @override
  void dispose() {
    _scrollController.dispose();
    _textController.dispose();
    _textFieldFocusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TooltipOverlay(
      // 使用TooltipOverlay包装整个界面
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: Theme.of(context).colorScheme.inversePrimary,
          title: Text(widget.title),
          actions: [
            IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: _refreshAllSections,
              tooltip: '刷新',
            ),
            IconButton(
              icon: const Icon(Icons.add),
              onPressed: _resetChat,
              tooltip: '新对话',
            ),
            IconButton(
              icon: const Icon(Icons.settings),
              onPressed: _showConfigDialog,
              tooltip: '配置',
            ),
          ],
        ),
        body: Container(
          constraints: const BoxConstraints(minWidth: 1024, minHeight: 768),
          child: Row(
            children: [
              // 左侧四个区域 - 分为上下两排，每排两个区域
              Expanded(flex: 1, child: _buildLeftPanel()),
              // 右侧聊天区域
              Expanded(flex: 1, child: _buildChatPanel()),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLeftPanel() {
    return Column(
      children: [
        // 上排两个区域
        Expanded(
          flex: 1,
          child: Row(
            children: [
              Expanded(
                child: FileSection(
                  key: _waitingSectionKey,
                  title: '等待',
                  onFilesChanged: _refreshAllSections,
                  onFileOpened: _loadDocumentContent,  // 添加回调
                ),
              ),
              Expanded(
                child: FileSection(
                  key: _readSectionKey,
                  title: '读取',
                  onFilesChanged: _refreshAllSections,
                  onFileOpened: _loadDocumentContent,  // 添加回调
                ),
              ),
            ],
          ),
        ),
        // 下排两个区域
        Expanded(
          flex: 1,
          child: Row(
            children: [
              Expanded(
                child: FileSection(
                  key: _templateSectionKey,
                  title: '模板',
                  onFilesChanged: _refreshAllSections,
                  onFileOpened: _loadDocumentContent,  // 添加回调
                ),
              ),
              Expanded(
                child: FileSection(
                  key: _resultSectionKey,
                  title: '结果',
                  onFilesChanged: _refreshAllSections,
                  onFileOpened: _loadDocumentContent,  // 添加回调
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildChatPanel() {
    return Column(
      children: [
        Expanded(
          child: ListView.builder(
            controller: _scrollController,
            itemCount: _messages.length + (_isLoading ? 1 : 0),
            itemBuilder: (context, index) {
              if (index >= _messages.length) {
                return _buildLoadingIndicator();
              }
              return ChatMessageItem(message: _messages[index]);
            },
          ),
        ),
        _buildInputArea(),
      ],
    );
  }

  Widget _buildLoadingIndicator() {
    return Padding(
      padding: const EdgeInsets.all(8.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(12.0),
            decoration: BoxDecoration(
              color: Colors.blue[50],
              borderRadius: BorderRadius.circular(8.0),
              border: Border.all(
                color: const Color.fromARGB(255, 177, 197, 213),
                width: 2.0,
              ),
            ),
            child: const Row(
              children: [
                CircularProgressIndicator(),
                SizedBox(width: 5),
                Text(
                  'AI正在思考...',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16.0),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInputArea() {
    return Padding(
      padding: const EdgeInsets.all(8.0),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              focusNode: _textFieldFocusNode,
              controller: _textController,
              decoration: const InputDecoration(
                hintText: '请输入您的问题...',
                border: OutlineInputBorder(),
              ),
              onSubmitted: _sendMessage,
            ),
          ),
          IconButton(
            onPressed: () => _sendMessage(_textController.text),
            icon: const Icon(Icons.send),
          ),
        ],
      ),
    );
  }
}