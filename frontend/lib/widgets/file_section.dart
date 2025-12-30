import 'package:flutter/material.dart';
import 'package:desktop_drop/desktop_drop.dart';
import 'dart:io';
import 'package:path/path.dart' as path;
import '../models/file_info.dart';
import '../services/api_service.dart';
import 'tooltip_overlay.dart';
import 'package:file_picker/file_picker.dart';

class FileSection extends StatefulWidget {
  final String title;
  final VoidCallback? onFilesChanged;
  final Function(String)? onFileOpened;  // 添加回调函数

  const FileSection({
    super.key, 
    required this.title, 
    this.onFilesChanged,
    this.onFileOpened,  // 添加回调参数
  });

  @override
  State<FileSection> createState() => FileSectionState();
}

// 将State类改为公开的，以便外部可以引用
class FileSectionState extends State<FileSection> {
  late Future<List<FileInfo>> _filesFuture;
  String _currentPath = '';
  // 防止重复操作的标志位
  // ScaffoldMessengerState? _scaffoldMessenger; // 未使用，已移除

  bool _isProcessing = false;

  @override
  void initState() {
    super.initState();
    _refreshFiles();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // 保存 ScaffoldMessengerState 引用
    // _scaffoldMessenger = ScaffoldMessenger.of(context);
  }

  void _refreshFiles() {
    setState(() {
      _filesFuture = ApiService.getDirectoryFiles(widget.title);
    });
  }

  void _navigateToDirectory(String dirName) {
    // 防止在处理中时导航
    if (_isProcessing) return;

    setState(() {
      _currentPath = '$_currentPath/$dirName';
      _refreshFiles();
    });
  }

  void _navigateBack() {
    // 防止在处理中时导航
    if (_isProcessing) return;

    if (_currentPath.isNotEmpty) {
      setState(() {
        final parts = _currentPath.split('/');
        parts.removeLast();
        _currentPath = parts.join('/');
        if (_currentPath.startsWith('/')) {
          _currentPath = _currentPath.substring(1);
        }
        _refreshFiles();
      });
    }
  }

  // 导出文件功能
  void _exportFiles() async {
    // 防止在处理中时导出
    if (_isProcessing) return;

    // 获取当前区域的文件列表
    final files = await ApiService.getDirectoryFiles(widget.title);

    if (files.isEmpty) {
      return;
    }

    // 这里可以选择导出单个文件或多选导出
    if (files.length == 1) {
      setState(() {
        _isProcessing = true;
      });

      // 如果只有一个文件或文件夹，直接导出
      _exportSingleFile(files.first);
    } else {
      // 如果有多个文件，让用户选择要导出的文件
      _selectFilesToExport(files);
    }
  }

  // 解决文件夹名冲突
  Future<String?> _resolveDirectoryConflict(
    Directory sectionDir,
    String originalName,
  ) async {
    // 首先检查是否已有带数字后缀的版本
    String newName = originalName;
    int counter = 2;

    while (await Directory('${sectionDir.path}/$newName').exists()) {
      newName = '$originalName($counter)';
      counter++;
    }

    // 返回新名称
    return newName;
  }

  // 解决文件名冲突
  Future<String?> _resolveFileConflict(
    Directory sectionDir,
    String originalName,
  ) async {
    // 首先检查是否已有带数字后缀的版本
    String newName = originalName;
    int counter = 2;

    while (await File('${sectionDir.path}/$newName').exists()) {
      // 分离文件名和扩展名
      final lastDotIndex = originalName.lastIndexOf('.');
      if (lastDotIndex > 0) {
        final nameWithoutExtension = originalName.substring(0, lastDotIndex);
        final extension = originalName.substring(lastDotIndex);
        newName = '$nameWithoutExtension($counter)$extension';
      } else {
        newName = '$originalName($counter)';
      }
      counter++;
    }

    // 返回新名称
    return newName;
  }

  // 导出单个文件或文件夹
  void _exportSingleFile(FileInfo file) async {
    final success = await _exportFileOrDirectory(
      file.path,
      file.name,
      file.isDirectory,
    );
    if (success && mounted) {
      TooltipUtil.showTooltip(
        '${file.isDirectory ? '文件夹' : '文件'}导出成功',
        TooltipPosition.fileAreaCenter,
      );
    } else if (mounted) {
      TooltipUtil.showTooltip(
        '${file.isDirectory ? '文件夹' : '文件'}导出失败',
        TooltipPosition.fileAreaCenter,
      );
    }

    if (mounted) {
      setState(() {
        _isProcessing = false;
      });
    }
  }

  // 导出文件或目录 - 通过API调用后端服务
  Future<bool> _exportFileOrDirectory(String filePath, String fileName, bool isDirectory) async {
    try {
      // 实际项目中，这里应该调用后端API来处理文件导出
      // 这里只是模拟实现，需要根据实际后端API实现
      return true;
    } catch (e) {
      print('Error exporting file: $e');
      return false;
    }
  }

  // 选择要导出的文件
  void _selectFilesToExport(List<FileInfo> files) {
    // 防止在处理中时导出
    if (_isProcessing) return;

    final selectedFiles = <FileInfo>[];

    if (mounted) {
      showDialog(
        context: context,
        builder: (BuildContext context) {
          return StatefulBuilder(
            builder: (context, setState) {
              return AlertDialog(
                title: const Text('选择要导出的文件'),
                content: SizedBox(
                  width: double.maxFinite,
                  child: ListView.builder(
                    shrinkWrap: true,
                    itemCount: files.length,
                    itemBuilder: (context, index) {
                      final file = files[index];
                      return CheckboxListTile(
                        value: selectedFiles.contains(file),
                        onChanged: (bool? value) {
                          setState(() {
                            if (value == true) {
                              selectedFiles.add(file);
                            } else {
                              selectedFiles.remove(file);
                            }
                          });
                        },
                        title: Text(file.name),
                        secondary: Icon(
                          file.isDirectory ? Icons.folder : Icons.description,
                        ),
                      );
                    },
                  ),
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('取消'),
                  ),
                  TextButton(
                    onPressed: () async {
                      if (selectedFiles.isNotEmpty) {
                        Navigator.of(context).pop();

                        // 设置处理状态
                        setState(() {
                          _isProcessing = true;
                        });

                        // 执行导出操作
                        bool allSuccess = true;
                        for (final file in selectedFiles) {
                          final success = await _exportFileOrDirectory(
                            file.path,
                            file.name,
                            file.isDirectory,
                          );
                          if (!success) {
                            allSuccess = false;
                          }
                        }

                        // 显示导出结果提示
                        if (mounted) {
                          TooltipUtil.showTooltip(
                            allSuccess ? '文件导出成功' : '部分文件导出失败',
                            TooltipPosition.fileAreaCenter,
                          );

                          setState(() {
                            _isProcessing = false;
                          });
                        }
                      }
                    },
                    child: const Text('导出'),
                  ),
                ],
              );
            },
          );
        },
      );
    }
  }

  // 公共方法，允许外部触发刷新
  void refreshFiles() {
    _refreshFiles();
  }

  // 构建标题文本，处理文字过长问题
  Widget _buildTitleText() {
    if (_currentPath.isEmpty) {
      // 没有路径，只显示区域名
      return Text(
        widget.title,
        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14.0),
        overflow: TextOverflow.ellipsis,
      );
    }

    // 只显示最内层目录名
    final pathParts = _currentPath.split('/');
    final innermostDir = pathParts.last; // 获取最内层目录名

    // 如果超过10个字符，则截取前10个字符并添加省略号
    String displayText = innermostDir;
    if (innermostDir.length > 10) {
      displayText = '${innermostDir.substring(0, 10)}...';
    }

    return Text(
      '${widget.title} > $displayText',
      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14.0),
      overflow: TextOverflow.ellipsis,
    );
  }

  @override
  Widget build(BuildContext context) {
    return DropTarget(
      onDragEntered: (details) {
        // 拖拽进入时的效果
        setState(() {
          // 可以添加视觉反馈
        });
      },
      onDragExited: (details) {
        // 拖拽离开时的效果
        setState(() {
          // 可以移除视觉反馈
        });
      },
      onDragDone: (details) async {
        // 处理拖拽完成事件
        if (details.files.isNotEmpty) {
          bool allSuccess = true;
          int successCount = 0;

          for (final draggedFile in details.files) {
            try {
              // 获取目标目录
              final sectionDir = await _getSectionDirectory(
                widget.title,
                _currentPath,
              );

              // 检查拖拽的是文件还是文件夹
              final fileStat = File(draggedFile.path!).statSync();
              if (fileStat.type == FileSystemEntityType.directory) {
                // 处理文件夹拖拽
                final sourceDir = Directory(draggedFile.path!);
                final dirName = path.basename(draggedFile.path!);
                final targetPath = '${sectionDir.path}/$dirName';
                final targetDir = Directory(targetPath);

                // 检查目标目录是否已存在
                if (await targetDir.exists()) {
                  // 目标目录已存在，需要处理冲突
                  final newName = await _resolveDirectoryConflict(
                    sectionDir,
                    dirName,
                  );
                  if (newName != null) {
                    // 使用新名称
                    final newTargetPath = '${sectionDir.path}/$newName';
                    final newTargetDir = Directory(newTargetPath);
                    await _copyDirectory(sourceDir, newTargetDir);
                    successCount++;
                  }
                } else {
                  // 目录不存在，直接复制
                  await _copyDirectory(sourceDir, targetDir);
                  successCount++;
                }
              } else {
                // 处理文件拖拽
                final fileName = path.basename(draggedFile.path!);
                final targetPath = '${sectionDir.path}/$fileName';
                final targetFile = File(targetPath);

                // 检查目标文件是否已存在
                if (await targetFile.exists()) {
                  // 目标文件已存在，需要处理冲突
                  final newName = await _resolveFileConflict(
                    sectionDir,
                    fileName,
                  );
                  if (newName != null) {
                    // 使用新名称
                    final newTargetPath = '${sectionDir.path}/$newName';
                    final newTargetFile = File(newTargetPath);
                    final sourceFile = File(draggedFile.path!);
                    await sourceFile.copy(newTargetPath);
                    successCount++;
                  }
                } else {
                  // 文件不存在，直接复制
                  final sourceFile = File(draggedFile.path!);
                  await sourceFile.copy(targetPath);
                  successCount++;
                }
              }
            } catch (e) {
              allSuccess = false;
              if (mounted) {
                TooltipUtil.showTooltip(
                  '文件 "${draggedFile.name}" 导入失败: $e',
                  TooltipPosition.fileAreaCenter,
                );
              }
            }
          }

          if (successCount > 0 && mounted) {
            TooltipUtil.showTooltip(
              '$successCount 个文件/文件夹导入成功',
              TooltipPosition.fileAreaCenter,
            );
            _refreshFiles();

            // 刷新所有区域
            widget.onFilesChanged?.call();
          }
        }
      },
      child: Container(
        margin: const EdgeInsets.all(4.0),
        decoration: BoxDecoration(
          border: Border.all(color: Colors.grey),
          borderRadius: BorderRadius.circular(8.0),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 区域标题栏
            Container(
              padding: const EdgeInsets.all(8.0),
              decoration: BoxDecoration(
                color: Colors.grey[300],
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(8.0),
                ),
              ),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back),
                    onPressed: _currentPath.isEmpty ? null : _navigateBack,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                  const SizedBox(width: 4),
                  // 修改区域标题显示方式，处理文字过长问题
                  Expanded(child: _buildTitleText()),
                  const Spacer(),
                  IconButton(
                    icon: Icon(
                      widget.title == '结果'
                          ? Icons.download_for_offline_outlined
                          : Icons.upload_file,
                      size: 20,
                    ),
                    onPressed: () async {
                      if (widget.title == '结果') {
                        // 导出文件功能
                        _exportFiles();
                      } else {
                        // 导入文件功能 - 显示选项菜单
                        _showImportMenu(context);
                      }
                    },
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                  const SizedBox(width: 4),
                ],
              ),
            ),
            // 文件列表区域
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(8.0),
                child: FutureBuilder<List<FileInfo>>(
                  future: _filesFuture,
                  builder: (context, snapshot) {
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const Center(child: CircularProgressIndicator());
                    }

                    if (snapshot.hasError) {
                      return Center(child: Text('加载错误: ${snapshot.error}'));
                    }

                    final files = snapshot.data ?? [];

                    if (files.isEmpty) {
                      return const Center(
                        child: Text(
                          '暂无文件',
                          style: TextStyle(color: Colors.grey),
                        ),
                      );
                    }

                    return ListView.builder(
                      itemCount: files.length,
                      itemBuilder: (context, index) {
                        final file = files[index];
                        return _FileItem(
                          file: file,
                          currentSection: widget.title,
                          onDoubleTap: () async {
                            if (file.isDirectory) {
                              // 展开文件夹
                              _navigateToDirectory(file.name);
                            } else {
                              // 打开文件
                              // 调用父组件传递的回调函数，通知打开了文件
                              if (widget.onFileOpened != null) {
                                widget.onFileOpened!(file.path);
                              }
                              await _openFile(file.path);
                            }
                          },
                          onDelete: () {
                            _confirmDelete(context, file);
                          },
                          onRefresh: _refreshFiles,
                          onMoveToSection: (targetSection) async {
                            final success = await ApiService.moveFile(
                              file.path,
                              targetSection,
                            );

                            if (success) {
                              if (mounted) {
                                TooltipUtil.showTooltip(
                                  '文件 "${file.name}" 已移动到 "$targetSection"',
                                  TooltipPosition.fileAreaCenter,
                                );
                                // 刷新所有区域
                                widget.onFilesChanged?.call();
                              }
                            } else {
                              if (mounted) {
                                TooltipUtil.showTooltip(
                                  '移动文件 "${file.name}" 失败',
                                  TooltipPosition.fileAreaCenter,
                                );
                              }
                            }
                          },
                        );
                      },
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // 删除文件 - 通过API调用后端服务
  Future<bool> _deleteFile(String filePath) async {
    try {
      return await ApiService.deleteFile(filePath);
    } catch (e) {
      print('Error deleting file: $e');
      return false;
    }
  }

  void _confirmDelete(BuildContext context, FileInfo file) {
    showDialog(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          title: const Text('确认删除'),
          content: Text('确定要删除 "${file.name}" 吗？'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('取消'),
            ),
            TextButton(
              onPressed: () async {
                Navigator.of(context).pop();
                final success = await _deleteFile(file.path);
                if (success) {
                  if (mounted) {
                    TooltipUtil.showTooltip(
                      '删除成功',
                      TooltipPosition.fileAreaCenter,
                    );
                    _refreshFiles();

                    // 刷新所有区域
                    widget.onFilesChanged?.call();
                  }
                } else {
                  if (mounted) {
                    TooltipUtil.showTooltip(
                      '删除失败',
                      TooltipPosition.fileAreaCenter,
                    );
                  }
                }
              },
              child: const Text('确定'),
            ),
          ],
        );
      },
    );
  }

  // 获取区域目录
  Future<Directory> _getSectionDirectory(String section, String currentPath) async {
    // 实际上，目录路径应该由后端处理，前端只需要知道section名称
    // 这里返回section名称，供后端API使用
    return Directory(section);
  }

  // 复制目录
  Future<void> _copyDirectory(Directory source, Directory destination) async {
    // 实际项目中，目录操作应该通过后端API完成
    // 这里只是模拟实现
  }

  // 打开文件
  Future<void> _openFile(String filePath) async {
    // 实际项目中，文件打开应该通过后端API完成
    // 这里只是模拟实现
  }

  // 选择并导入文件
  Future<bool> _pickAndImportFile(String sectionName, [String subPath = '']) async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.any,
        allowMultiple: false,
      );

      if (result != null && result.files.single.path != null) {
        final filePath = result.files.single.path!;
        
        // 调用后端API上传文件到指定区域
        final success = await ApiService.uploadFile(sectionName, filePath);
        
        return success;
      } else {
        print('No file selected');
        return false;
      }
    } catch (e) {
      print('Error picking and importing file: $e');
      return false;
    }
  }

  // 选择并导入目录 - 这个功能在FilePicker中不直接支持，我们只处理文件
  Future<bool> _pickAndImportDirectory(String sectionName, [String subPath = '']) async {
    try {
      // FilePicker不直接支持文件夹选择，我们提示用户
      if (mounted) {
        showDialog(
          context: context,
          builder: (BuildContext context) {
            return AlertDialog(
              title: const Text('功能提示'),
              content: const Text('文件夹导入功能暂不支持，请逐个导入文件或使用拖拽功能。'),
              actions: [
                TextButton(
                  onPressed: () {
                    Navigator.of(context).pop();
                  },
                  child: const Text('确定'),
                ),
              ],
            );
          },
        );
      }
      return false;
    } catch (e) {
      print('Error picking and importing directory: $e');
      return false;
    }
  }

  // 新增：显示导入菜单（文件或文件夹）
  void _showImportMenu(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (BuildContext context) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.file_present),
                title: const Text('导入文件'),
                onTap: () async {
                  Navigator.pop(context);
                  final success = await _pickAndImportFile(
                    widget.title,
                    _currentPath,
                  );
                  if (success) {
                    if (mounted) {
                      TooltipUtil.showTooltip(
                        '文件导入成功',
                        TooltipPosition.fileAreaCenter,
                      );
                      // 刷新文件列表
                      _refreshFiles();

                      // 刷新所有区域
                      widget.onFilesChanged?.call();
                    }
                  } else {
                    if (mounted) {
                      TooltipUtil.showTooltip(
                        '文件导入失败',
                        TooltipPosition.fileAreaCenter,
                      );
                    }
                  }
                },
              ),
              ListTile(
                leading: const Icon(Icons.folder),
                title: const Text('导入文件夹'),
                onTap: () async {
                  Navigator.pop(context);
                  final success = await _pickAndImportDirectory(
                    widget.title,
                    _currentPath,
                  );
                  if (success) {
                    if (mounted) {
                      TooltipUtil.showTooltip(
                        '文件夹导入成功',
                        TooltipPosition.fileAreaCenter,
                      );
                      // 刷新文件列表
                      _refreshFiles();

                      // 刷新所有区域
                      widget.onFilesChanged?.call();
                    }
                  } else {
                    if (mounted) {
                      TooltipUtil.showTooltip(
                        '文件夹导入失败或已取消',
                        TooltipPosition.fileAreaCenter,
                      );
                    }
                  }
                },
              ),
            ],
          ),
        );
      },
    );
  }
}

class _FileItem extends StatefulWidget {
  final FileInfo file;
  final String currentSection;
  final VoidCallback onDoubleTap;
  final VoidCallback onDelete;
  final VoidCallback onRefresh;
  final Function(String) onMoveToSection;

  const _FileItem({
    required this.file,
    required this.currentSection,
    required this.onDoubleTap,
    required this.onDelete,
    required this.onRefresh,
    required this.onMoveToSection,
  });

  @override
  State<_FileItem> createState() => _FileItemState();
}

class _FileItemState extends State<_FileItem> {
  // bool _isSelected = false; // 未使用，已移除
  bool _isHovered = false; // 添加悬停状态

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onDoubleTap: widget.onDoubleTap,
      onTap: () {
        // 单击文件不产生视觉反馈
      },
      onLongPress: () {
        // 长按显示操作菜单
        _showContextMenu(context);
      },
      child: MouseRegion(
        onEnter: (_) => setState(() => _isHovered = true),
        onExit: (_) => setState(() => _isHovered = false),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          decoration: BoxDecoration(
            color: _isHovered ? Colors.grey[200] : null, // 悬停时变灰
            borderRadius: BorderRadius.circular(4.0),
          ),
          child: ListTile(
            dense: true,
            leading: Icon(
              widget.file.isDirectory ? Icons.folder : Icons.description,
              size: 20,
            ),
            title: Text(widget.file.name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
            subtitle: Text(
              widget.file.isDirectory
                  ? '文件夹'
                  : '文件 • ${_formatFileSize(widget.file.size)}',
              style: const TextStyle(fontSize: 12, color: Colors.grey),
            ),
            contentPadding: const EdgeInsets.symmetric(horizontal: 8.0),
            trailing: PopupMenuButton<String>(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8.0)), // 添加圆角矩形形状
              elevation: 4, // 添加阴影
              padding: EdgeInsets.zero, // 调整内边距
              // 添加性能优化参数
              splashRadius: 20, // 减小水波效果半径
              icon: Icon(Icons.more_vert, size: 20), // 添加固定图标
              onSelected: (String value) {
                switch (value) {
                  case 'open':
                    // 对于文件夹，进入下一级；对于文件，执行双击操作
                    if (widget.file.isDirectory) {
                      // 进入文件夹
                      widget.onDoubleTap(); // 这会调用 _navigateToDirectory 方法
                    } else {
                      // 打开文件
                      widget.onDoubleTap(); // 这会调用 _openFile 方法
                    }
                    break;
                  case 'delete':
                    widget.onDelete();
                    break;
                  case 'move_to_waiting':
                    widget.onMoveToSection('等待');
                    break;
                  case 'move_to_read':
                    widget.onMoveToSection('读取');
                    break;
                  case 'move_to_template':
                    widget.onMoveToSection('模板');
                    break;
                  case 'move_to_result':
                    widget.onMoveToSection('结果');
                    break;
                }
              },
              itemBuilder: (BuildContext context) => <PopupMenuEntry<String>>[
                // 为文件和文件夹都添加打开选项
                PopupMenuItem<String>(
                  value: 'open',
                  height: 40, // 固定高度以提升性能
                  padding: EdgeInsets.symmetric(horizontal: 16), // 添加水平内边距
                  child: Text('打开', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.normal)),
                ),
                const PopupMenuDivider(height: 1),
                if (widget.currentSection != '等待')
                  PopupMenuItem<String>(
                    value: 'move_to_waiting',
                    height: 40, // 固定高度以提升性能
                    padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8), // 统一内边距
                    child: Text('移动到 等待', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.normal)),
                  ),
                if (widget.currentSection != '读取')
                  PopupMenuItem<String>(
                    value: 'move_to_read',
                    height: 40, // 固定高度以提升性能
                    padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8), // 统一内边距
                    child: Text('移动到 读取', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.normal)),
                  ),
                if (widget.currentSection != '模板')
                  PopupMenuItem<String>(
                    value: 'move_to_template',
                    height: 40, // 固定高度以提升性能
                    padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8), // 统一内边距
                    child: Text('移动到 模板', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.normal)),
                  ),
                if (widget.currentSection != '结果')
                  PopupMenuItem<String>(
                    value: 'move_to_result',
                    height: 40, // 固定高度以提升性能
                    padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8), // 统一内边距
                    child: Text('移动到 结果', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.normal)),
                  ),
                const PopupMenuDivider(),
                PopupMenuItem<String>(
                  value: 'delete',
                  height: 40, // 固定高度以提升性能
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Text('删除', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.normal)),
                ),
                const PopupMenuDivider(height: 1),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showContextMenu(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (BuildContext context) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.info),
                title: Text('属性', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.normal)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16.0),
                onTap: () {
                  Navigator.pop(context);
                  _showFileDetails(context);
                },
              ),
              // 为文件和文件夹都添加打开选项
              ListTile(
                leading: const Icon(Icons.open_in_browser),
                title: Text('打开', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.normal)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16.0),
                onTap: () {
                  Navigator.pop(context);
                  widget.onDoubleTap();
                },
              ),
              ListTile(
                leading: const Icon(Icons.delete),
                title: Text('删除', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.normal)),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16.0),
                onTap: () {
                  Navigator.pop(context);
                  widget.onDelete();
                },
              ),
            ],
          ),
        );
      },
    );
  }

  void _showFileDetails(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (BuildContext context) {
        return SafeArea(
          child: Container(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.file.name,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 16),
                Text('类型: ${widget.file.isDirectory ? "文件夹" : "文件"}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.normal)),
                Text('路径: ${widget.file.path}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.normal)),
                // 只有文件才显示大小
                if (!widget.file.isDirectory)
                  Text('大小: ${_formatFileSize(widget.file.size)}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.normal)),
                Text('修改时间: ${_formatDateTime(widget.file.modified)}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.normal)),
                Text('创建时间: ${_formatDateTime(widget.file.createdAt)}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.normal)),
              ],
            ),
          ),
        );
      },
    );
  }

  String _formatFileSize(int size) {
    if (size < 1024) {
      return '$size B';
    } else if (size < 1024 * 1024) {
      return '${(size / 1024).toStringAsFixed(2)} KB';
    } else if (size < 1024 * 1024 * 1024) {
      return '${(size / (1024 * 1024)).toStringAsFixed(2)} MB';
    } else {
      return '${(size / (1024 * 1024 * 1024)).toStringAsFixed(2)} GB';
    }
  }

  String _formatDateTime(DateTime dateTime) {
    return '${dateTime.year}-${dateTime.month.toString().padLeft(2, '0')}-${dateTime.day.toString().padLeft(2, '0')} '
        '${dateTime.hour.toString().padLeft(2, '0')}:${dateTime.minute.toString().padLeft(2, '0')}:${dateTime.second.toString().padLeft(2, '0')}';
  }
}