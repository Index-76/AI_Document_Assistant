import 'package:http/http.dart' as http;
import 'dart:convert';
import '../models/file_info.dart';
import 'package:dio/dio.dart';

class ApiService {
  // 从环境或配置中获取后端API基础URL，允许更灵活的配置
  static String get baseUrl {
    // 尝试从配置中获取，如果不存在则使用默认值
    // 这样可以在不同环境（开发、测试、生产）中使用不同的后端地址
    return 'http://localhost:2070/api';
  }

  // 获取配置
  static Future<Map<String, dynamic>?> getConfig() async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/config'),
        headers: {'Content-Type': 'application/json'},
      );

      if (response.statusCode == 200) {
        return json.decode(response.body);
      } else {
        print('Failed to get config: ${response.statusCode} - ${response.body}');
        return null;
      }
    } catch (e) {
      print('Error getting config: $e');
      return null;
    }
  }

  // 更新配置
  static Future<bool> updateConfig(Map<String, dynamic> configData) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/config'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode(configData),
      );

      if (response.statusCode == 200) {
        return true;
      } else {
        print('Failed to update config: ${response.statusCode} - ${response.body}');
        return false;
      }
    } catch (e) {
      print('Error updating config: $e');
      return false;
    }
  }

  // 获取目录文件列表
  static Future<List<FileInfo>> getDirectoryFiles(String section) async {
    try {
      final response = await http.get(
        Uri.parse('$baseUrl/directory-view?section=$section'),
        headers: {'Content-Type': 'application/json'},
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        final List<dynamic> files = data['files'] ?? [];
        
        return files.map((file) => FileInfo.fromJson(file)).toList();
      } else if (response.statusCode == 500) {
        // 详细错误信息
        print('Failed to get directory files: ${response.statusCode} - ${response.body}');
        
        // 尝试解析错误响应
        try {
          final errorData = json.decode(response.body);
          print('Server error details: ${errorData['error']} - ${errorData['details'] ?? ''}');
        } catch (e) {
          print('Could not parse error response: $e');
          print('Raw error response: ${response.body}');
        }
        return [];
      } else if (response.statusCode == 400) {
        print('Bad request to get directory files: ${response.statusCode} - ${response.body}');
        return [];
      } else {
        print('Failed to get directory files: ${response.statusCode} - ${response.body}');
        return [];
      }
    } catch (e) {
      print('Error getting directory files: $e');
      
      // 检查是否是连接错误
      if (e is http.ClientException) {
        print('Connection error - please check if the backend server is running on http://localhost:2070');
      } else if (e is FormatException) {
        print('Response format error - the server may have returned an invalid response');
      }
      return [];
    }
  }

  // 获取文档内容
  static Future<String?> getDocumentContent(String filePath) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/document-content'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'filePath': filePath}),
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        return data['content'] ?? '';
      } else {
        print('Failed to get document content: ${response.statusCode} - ${response.body}');
        return null;
      }
    } catch (e) {
      print('Error getting document content: $e');
      return null;
    }
  }

  // 上传文件到指定区域
  static Future<bool> uploadFile(String section, String filePath) async {
    try {
      // 使用Dio进行文件上传，因为它更适合处理文件上传
      final dioInstance = Dio();
      
      final formData = FormData.fromMap({
        'document': await MultipartFile.fromFile(filePath),
        'section': section, // 添加区域信息
      });

      final response = await dioInstance.post(
        '$baseUrl/upload-to-section',
        data: formData,
        options: Options(
          headers: {'Content-Type': 'multipart/form-data'},
        ),
      );

      return response.statusCode == 200;
    } catch (e) {
      print('Error uploading file: $e');
      return false;
    }
  }

  // 删除文件
  static Future<bool> deleteFile(String filePath) async {
    try {
      final response = await http.delete(
        Uri.parse('$baseUrl/file'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({'filePath': filePath}),
      );

      if (response.statusCode == 200) {
        final result = json.decode(response.body);
        return result['success'] ?? false;
      } else {
        print('Error deleting file: ${response.statusCode} - ${response.body}');
        return false;
      }
    } catch (e) {
      print('Error deleting file: $e');
      return false;
    }
  }

  // 移动文件
  static Future<bool> moveFile(String sourcePath, String targetSection) async {
    try {
      final response = await http.put(
        Uri.parse('$baseUrl/file/move'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'sourcePath': sourcePath,
          'targetSection': targetSection,
        }),
      );

      if (response.statusCode == 200) {
        final result = json.decode(response.body);
        return result['success'] ?? false;
      } else {
        print('Error moving file: ${response.statusCode} - ${response.body}');
        return false;
      }
    } catch (e) {
      print('Error moving file: $e');
      return false;
    }
  }

  // 与AI聊天（带工具决策）
  static Future<Map<String, dynamic>?> chatWithToolDecision(String message, [List<dynamic>? history]) async {
    try {
      final response = await http.post(
        Uri.parse('$baseUrl/chat-with-tool-decision'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'message': message,
          'history': history ?? [],
        }),
      );

      if (response.statusCode == 200) {
        return json.decode(response.body);
      } else {
        print('Failed to chat with tool decision: ${response.statusCode} - ${response.body}');
        return null;
      }
    } catch (e) {
      print('Error chatting with tool decision: $e');
      return null;
    }
  }
}