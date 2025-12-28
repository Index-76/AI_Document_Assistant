import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:async';
import 'dart:convert';
import 'package:flutter/services.dart' show rootBundle;

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
      print('无法加载配置文件，使用默认后端地址: $e');
    }
  }
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized(); // 确保在加载配置前初始化
  await Config.loadConfig(); // 加载配置
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AI Document Assistant',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        primarySwatch: Colors.blue,
      ),
      home: const MyHomePage(title: 'AI Document Assistant'),
    );
  }
}

class MyHomePage extends StatefulWidget {
  const MyHomePage({Key? key, required this.title}) : super(key: key);

  final String title;

  @override
  State<MyHomePage> createState() => _MyHomePageState();
}

class _MyHomePageState extends State<MyHomePage> {
  int _counter = 0;
  String _backendStatus = '正在检查后端连接...';
  Color _statusColor = Colors.orange;

  @override
  void initState() {
    super.initState();
    _checkBackendConnection();
  }

  // 获取后端API的基础URL - 现在从配置文件获取
  String getBackendUrl() {
    return Config.backendUrl;
  }

  Future<void> _checkBackendConnection() async {
    try {
      // 尝试连接到后端
      String backendUrl = getBackendUrl();
      final response = await http.get(
        Uri.parse(backendUrl), // 后端API地址
      );
      
      if (response.statusCode == 200) {
        setState(() {
          _backendStatus = '后端连接: 已连接';
          _statusColor = Colors.green;
        });
      } else {
        setState(() {
          _backendStatus = '后端连接: 连接失败';
          _statusColor = Colors.red;
        });
      }
    } catch (e) {
      setState(() {
        _backendStatus = '后端连接: 连接失败';
        _statusColor = Colors.red;
      });
    }
  }

  void _incrementCounter() {
    setState(() {
      _counter++;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                border: Border.all(color: _statusColor),
                borderRadius: BorderRadius.circular(5),
              ),
              child: Text(
                _backendStatus,
                style: TextStyle(
                  color: _statusColor,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            const SizedBox(height: 30),
            const Text(
              'Hello World',
            ),
            const Text(
              'You have pushed the button this many times:',
            ),
            Text(
              '$_counter',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _incrementCounter,
        tooltip: 'Increment',
        child: const Icon(Icons.add),
      ),
    );
  }
}