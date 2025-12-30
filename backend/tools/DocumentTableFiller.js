const fs = require('fs');
const path = require('path');
const fileManagerService = require('../services/fileManagerService');
const { DocumentConverter } = require('./DocumentConverter');
const { TableAnalyzer } = require('./TableAnalyzer');
const { TableFiller } = require('./TableFiller');
const { XlsxGenerator } = require('./XlsxGenerator');
const loggerService = require('../services/loggerService');

/**
 * 文档表格填充工具类
 * 实现根据文档内容自动填充Excel表格的完整流程
 */
class DocumentTableFiller {
  /**
   * 根据文档填写表格的完整流程
   *
   * 流程：
   * 1. 调用预处理所有读取区文件，获取读取区全部文件的文本内容
   * 2. 调用查看模板区目录，获取模板区目录
   * 3. 判断共有几个文件需要处理
   * 4. 根据目录顺序处理每个模板区文件：
   * 5. 预处理当前文件（模板区文件）
   * 6. 调用读取模板区表格并返回表头与格式的工具，获取需要填写的Excel的表头与格式
   * 7. 调用【根据读取区内容与表头、格式填写表格内容】的工具，获取需要填写Excel的全部内容
   * 8. 调用【根据整理后文本内容填写表格】的工具，在结果区创建填写完毕后的Excel文件
   * 9. 重复处理下一个模板区文件，直至全部处理完成
   */
  static async fillTablesFromDocuments() {
    loggerService.info('开始执行文档表格填充流程');

    // 1. 预处理所有读取区文件，获取读取区全部文件的文本内容
    const readContent = await this._preprocessAllReadFiles();
    loggerService.info('已完成读取区文件预处理');

    // 2. 调用查看模板区目录，获取模板区目录
    const templateFiles = await this._getTemplateFiles();
    loggerService.info(`模板区文件列表: ${JSON.stringify(templateFiles)}`);

    // 3. 判断共有几个文件需要处理
    // 过滤掉错误信息和空目录提示
    const validTemplateFiles = templateFiles
        .filter(file => 
          file !== '目录为空' &&
          !file.startsWith('目录不存在:') &&
          !file.startsWith('读取目录失败:')
        );

    if (validTemplateFiles.length === 0) {
      loggerService.warn('模板区没有需要处理的有效文件');
      return;
    }

    loggerService.info(`共需要处理 ${validTemplateFiles.length} 个文件`);

    // 4. 根据目录顺序处理每个文件
    for (let i = 0; i < validTemplateFiles.length; i++) {
      const fileName = validTemplateFiles[i];
      loggerService.info(`正在处理第 ${i + 1} 个文件: ${fileName}`);

      // 5. 预处理当前模板区文件
      const processedFileData = await this._preprocessCurrentTemplateFile(fileName);
      if (!processedFileData) {
        loggerService.warn(`文件 ${fileName} 预处理失败，跳过`);
        continue;
      }

      // 6. 调用分析工具，获取需要填写的Excel的表头与格式
      // 传入的是模板区文件预处理后的内容
      const textContent = processedFileData.textContent;

      const tableAnalysis = await TableAnalyzer.analyzeTableHeaders(
        textContent,  // 修复：直接传入textContent，而不是Promise
      );

      const analysisResult = JSON.parse(tableAnalysis);
      if (analysisResult.error) {
        loggerService.error(`文件 ${fileName} 表头分析失败: ${analysisResult.error}`);
        continue;
      }

      const tableInfo = analysisResult.table;
      const headers = tableInfo.columns;
      const format = tableInfo.format;

      loggerService.info(`文件 ${fileName} 分析完成，表头: ${JSON.stringify(headers)}，格式: ${format}`);

      // 7. 调用填充工具，获取需要填写Excel的全部内容
      
      const filledContent = await TableFiller.fillTableContent(
        readContent,
        headers,
        format,
      );

      // 8. 调用XLSX生成器，在结果区创建填写完毕后的Excel文件
      await this._generateXlsxFile(fileName, filledContent);
      loggerService.info(`文件 ${fileName} 处理完成`);
    }

    loggerService.info('文档表格填充流程执行完毕');
  }

  /**
   * 预处理所有读取区文件，获取读取区全部文件的文本内容
   */
  static async _preprocessAllReadFiles() {
    // 使用fileManagerService获取读取区目录
    const readDir = await fileManagerService.getSectionDirectory('读取');

    if (!fs.existsSync(readDir)) {
      loggerService.warn(`读取区目录不存在: ${readDir}`);
      return '';
    }

    const contentBuffer = [];
    let fileCount = 0;

    try {
      const entities = fs.readdirSync(readDir, { withFileTypes: true });
      for (const entity of entities) {
        if (entity.isFile()) {
          fileCount++;
          const fileName = path.basename(entity.name);
          loggerService.info(`正在预处理读取区文件: ${fileName}`);

          try {
            // 读取文件内容
            const filePath = path.join(readDir, entity.name);
            const fileBuffer = fs.readFileSync(filePath);
            const fileType = DocumentConverter.detectFileType(fileName);

            // 预处理文件
            const processedData = await DocumentConverter.preprocessFile(
              fileBuffer,
              fileType,
              fileName
            );

            

            // 添加文件名标识和内容到缓冲区
            contentBuffer.push(`=== ${fileName} ===`);
            // 修复：使用jsonData.textContent而不是textContent
            contentBuffer.push(processedData.jsonData?.textContent || processedData.textContent || '');
            contentBuffer.push(''); // 添加空行分隔
          } catch (e) {
            loggerService.error(`预处理文件 ${fileName} 时出错`, e);
          }
        }
      }

      loggerService.info(`从读取区提取的完整内容: ${contentBuffer.join('\n')}`);
      
      if (fileCount === 0) {
        loggerService.info('读取区目录为空');
      }
    } catch (e) {
      loggerService.error('读取读取区目录时出错', e);
    }

    return contentBuffer.join('\n');
  }

  /**
   * 获取模板区文件列表
   */
  static async _getTemplateFiles() {
    try {
      // 使用fileManagerService获取模板区目录
      const templateDir = await fileManagerService.getSectionDirectory('模板');
      if (!fs.existsSync(templateDir)) {
        return [`目录不存在: ${templateDir}`];
      }

      const entities = fs.readdirSync(templateDir, { withFileTypes: true });
      if (entities.length === 0) {
        return ['目录为空'];
      }

      return entities.map(entity => {
        const filename = path.basename(entity.name);
        return entity.isDirectory() ? `${filename}/` : filename;
      });
    } catch (e) {
      return [`读取目录失败: ${e.message}`];
    }
  }

  /**
   * 预处理当前模板区文件
   */
  static async _preprocessCurrentTemplateFile(fileName) {
    try {
      // 使用fileManagerService获取模板区文件路径
      const templateDir = await fileManagerService.getSectionDirectory('模板');
      const filePath = path.join(templateDir, fileName);
      const file = fs.createReadStream(filePath);

      if (!fs.existsSync(filePath)) {
        loggerService.warn(`文件不存在: ${filePath}`);
        return null;
      }

      const fileBuffer = fs.readFileSync(filePath);
      const fileType = DocumentConverter.detectFileType(fileName);

      loggerService.info(
        `文件 ${fileName} 的类型: ${DocumentConverter.getFileTypeDescription(fileType)}`
      );

      const processedData = await DocumentConverter.preprocessFile(
        fileBuffer,
        fileType,
        fileName
      );

      // 打印预处理结果的详细信息

      return processedData;
    } catch (e) {
      loggerService.error(`预处理模板区文件 ${fileName} 时出错`, e);
      return null;
    }
  }

  /**
   * 生成XLSX文件
   */
  static async _generateXlsxFile(originalFileName, jsonContent) {
    try {
      // 清理JSON字符串中的控制字符
      let cleanedJsonContent = jsonContent;
      // 移除可能的控制字符和多余的空白字符
      cleanedJsonContent = cleanedJsonContent
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
          
      const analysisResult = JSON.parse(cleanedJsonContent);
      if (analysisResult.error) {
        loggerService.error(`表格填充失败: ${analysisResult.error}`);
        return;
      }

      // 使用XLSX生成器创建Excel文件
      const generator = new XlsxGenerator();
      const fileBaseName = path.parse(originalFileName).name;
      const resultFileName = `${fileBaseName}_filled`;

      const filePath = await generator.generateXlsxFromJsonWithConflictResolution(
        cleanedJsonContent,
        resultFileName,
      );
      loggerService.info(`Excel文件已生成: ${filePath}`);
    } catch (e) {
      loggerService.error('生成XLSX文件时出错', e);
      // 提供更详细的错误信息
      loggerService.error(`原始JSON内容: ${jsonContent}`, e);
    }
  }
}

module.exports = { DocumentTableFiller };