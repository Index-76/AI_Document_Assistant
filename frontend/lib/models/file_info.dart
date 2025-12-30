class FileInfo {
  final String name;
  final String path;
  final bool isDirectory;
  final int size;
  final DateTime modified;
  final DateTime createdAt;

  FileInfo({
    required this.name,
    required this.path,
    required this.isDirectory,
    required this.size,
    required this.modified,
    required this.createdAt,
  });

  // 从JSON创建FileInfo实例
  factory FileInfo.fromJson(Map<String, dynamic> json) {
    return FileInfo(
      name: json['name'] ?? '',
      path: json['path'] ?? '',
      isDirectory: json['isDirectory'] ?? false,
      size: json['size']?.toInt() ?? 0,
      modified: DateTime.parse(json['updatedAt'] ?? json['modified'] ?? DateTime.now().toIso8601String()),
      createdAt: DateTime.parse(json['createdAt'] ?? DateTime.now().toIso8601String()),
    );
  }

  // 转换为JSON
  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'path': path,
      'isDirectory': isDirectory,
      'size': size,
      'modified': modified.toIso8601String(),
      'updatedAt': modified.toIso8601String(),
      'createdAt': createdAt.toIso8601String(),
    };
  }
}