const fs = require('fs');
const path = require('path');
const loggerService = require('../services/loggerService');

// 文件类型枚举
const FileType = {
  word: 'word',
  excel: 'excel',
  powerpoint: 'powerpoint',
  pdf: 'pdf',
  text: 'text',
  markdown: 'markdown',
  unknown: 'unknown'
};

/**
 * 文档预处理工具类
 * 支持识别常见办公文档类型(word, excel, ppt, pdf, txt, md)并进行预处理
 */
class DocumentConverter {
  /**
   * 根据文件扩展名判断文件类型
   */
  static detectFileType(fileName) {
    const extension = fileName.split('.').pop().toLowerCase();

    switch (extension) {
      case 'doc':
      case 'docx':
        return FileType.word;
      case 'xls':
      case 'xlsx':
        return FileType.excel;
      case 'ppt':
      case 'pptx':
        return FileType.powerpoint;
      case 'pdf':
        return FileType.pdf;
      case 'txt':
      case 'text':
        return FileType.text;
      case 'md':
      case 'markdown':
        return FileType.markdown;
      default:
        return FileType.unknown;
    }
  }

  /**
   * 获取文件类型的描述
   */
  static getFileTypeDescription(fileType) {
    switch (fileType) {
      case FileType.word:
        return 'Microsoft Word 文档';
      case FileType.excel:
        return 'Microsoft Excel 电子表格';
      case FileType.powerpoint:
        return 'Microsoft PowerPoint 演示文稿';
      case FileType.pdf:
        return 'PDF 文档';
      case FileType.text:
        return '纯文本文件';
      case FileType.markdown:
        return 'Markdown 文档';
      case FileType.unknown:
        return '未知文件类型';
    }
  }

  /**
   * 预处理文件内容并返回结构化数据
   */
  static async preprocessFile(fileBuffer, fileType, fileName) {
    // 处理文件名编码问题
    let processedFileName = fileName;
    try {
      // 尝试修复可能的编码问题
      processedFileName = Buffer.from(fileName, 'binary').toString('utf8');
      // 如果包含乱码字符，尝试使用系统默认编码
      if (processedFileName.includes('') || /[\uFFFD]/.test(processedFileName)) {
        processedFileName = Buffer.from(fileName, 'binary').toString('gbk');
      }
    } catch (e) {
      // 如果UTF-8解码失败，尝试GBK编码
      try {
        processedFileName = Buffer.from(fileName, 'binary').toString('gbk');
      } catch (e2) {
        // 如果都失败了，使用原始文件名
        processedFileName = fileName;
      }
    }

    loggerService.info(`正在分析: ${processedFileName}`);

    switch (fileType) {
      case FileType.word:
        loggerService.info(`正在预处理Word文档: ${processedFileName}`);
        const result1 = await this._preprocessWord(fileBuffer, processedFileName);
        loggerService.info(`预处理结束: ${processedFileName}`);
        return result1;

      case FileType.excel:
        loggerService.info(`正在预处理Excel文档: ${processedFileName}`);
        const result2 = await this._preprocessExcel(fileBuffer, processedFileName);
        loggerService.info(`预处理结束: ${processedFileName}`);
        return result2;

      case FileType.powerpoint:
        loggerService.info(`正在预处理PowerPoint文档: ${processedFileName}`);
        const result3 = await this._preprocessPowerPoint(fileBuffer, processedFileName);
        loggerService.info(`预处理结束: ${processedFileName}`);
        return result3;

      case FileType.pdf:
        loggerService.info(`正在预处理PDF文档: ${processedFileName}`);
        const result4 = await this._preprocessPdf(fileBuffer, processedFileName);
        loggerService.info(`预处理结束: ${processedFileName}`);
        return result4;

      case FileType.text:
      case FileType.markdown:
        // 特别处理CSV文件
        if (processedFileName.toLowerCase().endsWith('.csv')) {
          loggerService.info(`正在预处理CSV文件: ${processedFileName}`);
          const result = await this._preprocessText(fileBuffer, processedFileName);
          loggerService.info(`预处理结束: ${processedFileName}`);
          return result;
        }
        if (fileType === FileType.text) {
          loggerService.info(`正在预处理文本文件: ${processedFileName}`);
          const result = await this._preprocessText(fileBuffer, processedFileName);
          loggerService.info(`预处理结束: ${processedFileName}`);
          return result;
        } else {
          loggerService.info(`正在预处理Markdown文件: ${processedFileName}`);
          const result = await this._preprocessMarkdown(fileBuffer, processedFileName);
          loggerService.info(`预处理结束: ${processedFileName}`);
          return result;
        }

      case FileType.unknown:
        // 对于未知类型，尝试按文件扩展名判断
        const lowerFileName = processedFileName.toLowerCase();
        if (lowerFileName.endsWith('.csv')) {
          loggerService.info(`检测到CSV文件: ${processedFileName}`);
          const result = await this._preprocessText(fileBuffer, processedFileName);
          loggerService.info(`预处理结束: ${processedFileName}`);
          return result;
        }

        // 默认作为文本文件处理
        const result = await this._preprocessText(fileBuffer, processedFileName);
        loggerService.info(`未知文件类型，默认按文本处理: ${processedFileName}`);
        return result;
    }
  }

  /**
   * 预处理Word文档
   */
  static async _preprocessWord(fileBuffer, fileName) {
    try {
      if (fileName.toLowerCase().endsWith('.docx')) {
        // 需要使用jszip来处理docx文件
        const JSZip = require('jszip');
        const zip = await JSZip.loadAsync(fileBuffer);

        // 提取文档内容
        let textContent = '';
        if (zip.files['word/document.xml']) {
          const documentXml = await zip.file('word/document.xml').async('text');
          textContent = this._extractTextFromXml(documentXml);
        } else {
          console.log('Word文档中未找到 word/document.xml 文件');
        }

        // 提取文档属性
        let metadata = {};
        if (zip.files['docProps/core.xml']) {
          const propsContent = await zip.file('docProps/core.xml').async('text');
          metadata = this._extractMetadataFromXml(propsContent);
        }

        // 提取内部文本内容预览
        let textPreview = textContent;
        if (textContent.length > 2000) {
          textPreview = `${textContent.substring(0, 2000)}
... (content truncated, total ${textContent.length} characters)`;
        }

        // 结构化返回Word文档数据
        const jsonData = {
          type: 'word',
          format: 'docx',
          fileName: fileName,
          fileSize: fileBuffer.length,
          textContent: textContent,
          textContentPreview: textPreview,
          wordCount: textContent
            .split(/\s+/)
            .filter((s) => s.trim() !== '').length,
          metadata: metadata,
          paragraphs: textContent.split('\n').filter(p => p.trim() !== '')
        };

        return {
          success: true,
          jsonData: jsonData,
          type: FileType.WORD,
          metadata: jsonData
        };
      } else {
        // 对于旧版.doc文件，Node.js没有原生支持
        return {
          success: false,
          error: '旧版Word文档(.doc)格式无法直接解析，请转换为.docx格式',
          type: FileType.WORD
        };
      }
    } catch (e) {
      return {
        success: false,
        error: `解析过程中发生错误: ${e.message}`,
        type: FileType.WORD
      };
    }
  }

  /**
   * 预处理Excel文档
   */
  static async _preprocessExcel(fileBuffer, fileName) {
    try {
      if (fileName.toLowerCase().endsWith('.xlsx')) {
        const JSZip = require('jszip');
        const zip = await JSZip.loadAsync(fileBuffer);

        // 提取共享字符串表
        let sharedStrings = [];
        if (zip.files['xl/sharedStrings.xml']) {
          const sharedStringsXml = await zip.file('xl/sharedStrings.xml').async('text');
          sharedStrings = this._extractSharedStringsFromXml(sharedStringsXml);
        }

        // 获取工作表列表和内容
        let sheetNames = [];
        if (zip.files['xl/workbook.xml']) {
          const xmlContent = await zip.file('xl/workbook.xml').async('text');
          sheetNames = this._extractSheetNamesFromXml(xmlContent);
        }

        // 提取所有工作表的文本内容
        let allTextContent = [];

        // 提取每个工作表的单元格内容
        for (const [filename, file] of Object.entries(zip.files)) {
          if (filename.startsWith('xl/worksheets/sheet') &&
            filename.endsWith('.xml')) {
            const xmlContent = await file.async('text');
            // 提取单元格中的文本内容（包括共享字符串引用）
            const cellTexts = this._extractCellTextFromWorksheet(xmlContent, sharedStrings);
            allTextContent = allTextContent.concat(cellTexts);

            // 同时使用备选方法提取所有文本内容
            const allTexts = this._extractAllTextFromXml(xmlContent);
            allTextContent = allTextContent.concat(allTexts);
          }
        }

        // 去重并保留顺序
        const uniqueTexts = [];
        const seen = new Set();
        for (const text of allTextContent) {
          if (!seen.has(text)) {
            uniqueTexts.push(text);
            seen.add(text);
          }
        }
        allTextContent = uniqueTexts;

        loggerService.info(`通过所有方法提取的文本数量: ${allTextContent.length}`);
        loggerService.info(`提取的文本内容: ${allTextContent.slice(0, 20).join(", ")}${allTextContent.length > 20 ? "..." : ""}`);

        // 尝试构建CSV格式的内容
        const csvContent = await this._buildCsvFromExcelContent(zip, sharedStrings);

        const fullTextContent = allTextContent.join('\n').trim();
        loggerService.info(`最终合并后的文本内容长度: ${fullTextContent.length}`);

        // 提取内部文本内容预览
        let textPreview = fullTextContent;
        if (fullTextContent.length > 2000) {
          textPreview = `${fullTextContent.substring(0, 2000)}
... (content truncated, total ${fullTextContent.length} characters)`;
        }

        // 结构化返回Excel文档数据
        const jsonData = {
          type: 'excel',
          format: 'xlsx',
          fileName: fileName,
          fileSize: fileBuffer.length,
          textContent: csvContent ? csvContent : fullTextContent,
          textContentPreview: textPreview,
          sheetCount: sheetNames.length,
          sheetNames: sheetNames,
          sharedStringsCount: sharedStrings.length,
          metadata: { created: new Date().toISOString() },
        };

        return {
          success: true,
          jsonData: jsonData,
          type: FileType.EXCEL,
          metadata: jsonData,
          // 确保textContent可以直接从返回对象访问
          textContent: jsonData.textContent
        };
      } else {
        // 对于旧版.xls文件，Node.js没有原生支持
        return {
          success: false,
          error: '旧版Excel文档(.xls)格式无法直接解析，请转换为.xlsx格式',
          type: FileType.EXCEL
        };
      }
    } catch (e) {
      return {
        success: false,
        error: `解析过程中发生错误: ${e.message}`,
        type: FileType.EXCEL
      };
    }
  }

  /**
   * 从工作表XML中提取单元格文本
   */
  static _extractCellTextFromWorksheet(xmlContent, sharedStrings) {
    const cellTexts = [];

    // 匹配单元格元素 <c>...</c>
    const cellMatches = xmlContent.match(/<c[^>]*>(.*?)<\/c>/gs) || [];

    for (const cellMatch of cellMatches) {
      const cellContent = (cellMatch.match(/<c[^>]*>(.*?)<\/c>/s) || [])[1] || '';

      // 查找直接文本 <t>...</t>
      const directTextMatches = cellContent.match(/<t[^>]*>(.*?)<\/t>/gs) || [];
      for (const textMatch of directTextMatches) {
        let text = (textMatch.match(/<t[^>]*>(.*?)<\/t>/s) || [])[1] || '';
        // 处理转义字符
        text = text.replace(/&lt;/g, '<');
        text = text.replace(/&gt;/g, '>');
        text = text.replace(/&amp;/g, '&');
        text = text.replace(/&quot;/g, '"');
        text = text.replace(/&#39;/g, "'");
        if (text.trim() !== '') {
          cellTexts.push(text.trim());
        }
      }

      // 如果没有直接文本，查找数值引用 <v>...</v>
      if (directTextMatches.length === 0) {
        const valueMatches = cellContent.match(/<v[^>]*>(.*?)<\/v>/gs) || [];
        for (const valueMatch of valueMatches) {
          let value = (valueMatch.match(/<v[^>]*>(.*?)<\/v>/s) || [])[1] || '';
          if (value.trim() !== '') {
            // 尝试将值解析为整数，作为共享字符串的索引
            try {
              const index = parseInt(value.trim());
              if (index >= 0 && index < sharedStrings.length && sharedStrings[index] !== '') {
                // 使用共享字符串
                cellTexts.push(sharedStrings[index]);
              } else {
                // 如果索引无效或对应字符串为空，则直接使用值
                // 但要过滤掉纯数字索引
                if (!/^\d+$/.test(value.trim())) {
                  cellTexts.push(value.trim());
                }
              }
            } catch (e) {
              // 如果不是数字，直接使用值
              cellTexts.push(value.trim());
            }
          }
        }
      }
    }

    return cellTexts;
  }

  /**
   * 从XML中提取所有文本内容
   */
  static _extractAllTextFromXml(xmlContent) {
    const texts = [];

    // 移除XML声明和注释
    let content = xmlContent;
    content = content.replace(/<\?xml[^>]*>/gs, '');
    content = content.replace(/<!--.*?-->/gs, '');

    // 提取所有<t>标签中的文本内容（这是Excel中最常见的文本存储方式）
    const tTagMatches = content.match(/<t[^>]*>(.*?)<\/t>/gs) || [];
    for (const match of tTagMatches) {
      let text = (match.match(/<t[^>]*>(.*?)<\/t>/s) || [])[1] || '';
      // 处理转义字符
      text = text.replace(/&lt;/g, '<');
      text = text.replace(/&gt;/g, '>');
      text = text.replace(/&amp;/g, '&');
      text = text.replace(/&quot;/g, '"');
      text = text.replace(/&#39;/g, "'");
      // 清理空白字符
      text = text.trim();
      if (text !== '') {
        texts.push(text);
      }
    }

    // 提取is标签中的文本内容（另一种可能的文本存储方式）
    const isTagMatches = content.match(/<is><t[^>]*>(.*?)<\/t><\/is>/gs) || [];
    for (const match of isTagMatches) {
      let text = (match.match(/<is><t[^>]*>(.*?)<\/t><\/is>/s) || [])[1] || '';
      // 处理转义字符
      text = text.replace(/&lt;/g, '<');
      text = text.replace(/&gt;/g, '>');
      text = text.replace(/&amp;/g, '&');
      text = text.replace(/&quot;/g, '"');
      text = text.replace(/&#39;/g, "'");
      // 清理空白字符
      text = text.trim();
      if (text !== '') {
        texts.push(text);
      }
    }

    // 如果没有找到<t>标签内容，尝试提取所有标签内的文本内容
    if (texts.length === 0) {
      const textMatches = content.match(/>[^<]+</g) || [];
      for (const match of textMatches) {
        // 移除开头的>和结尾的<
        let text = match.substring(1, match.length - 1);
        // 清理空白字符
        text = text.trim();
        // 过滤掉纯数字和非常短的字符串（可能是索引）
        if (text !== '' && (text.length > 1 || !/^\d+$/.test(text))) {
          texts.push(text);
        }
      }
    }

    return texts;
  }

  /**
   * 预处理PowerPoint文档
   */
  static async _preprocessPowerPoint(fileBuffer, fileName) {
    try {
      if (fileName.toLowerCase().endsWith('.pptx')) {
        const JSZip = require('jszip');
        const zip = await JSZip.loadAsync(fileBuffer);

        // 提取所有幻灯片内容
        const slideContents = [];
        for (const [filename, file] of Object.entries(zip.files)) {
          if (filename.startsWith('ppt/slides/slide') &&
            filename.endsWith('.xml')) {
            const xmlContent = await file.async('text');
            const textContent = this._extractTextFromXml(xmlContent);
            if (textContent !== '') {
              slideContents.push(textContent);
            }
          }
        }

        const fullTextContent = slideContents.join('\n\n');

        // 提取内部文本内容预览
        let textPreview = fullTextContent;
        if (fullTextContent.length > 2000) {
          textPreview = `${fullTextContent.substring(0, 2000)}
... (content truncated, total ${fullTextContent.length} characters)`;
        }

        // 计算幻灯片数量
        const slideCount = slideContents.length;

        // 结构化返回PowerPoint文档数据
        const jsonData = {
          type: 'powerpoint',
          format: 'pptx',
          fileName: fileName,
          fileSize: fileBuffer.length,
          textContent: fullTextContent,
          textContentPreview: textPreview,
          slideCount: slideCount,
          metadata: { created: new Date().toISOString() },
          pages: slideContents.map((content, index) => ({
            slideNumber: index + 1,
            content: content
          }))
        };

        return {
          success: true,
          jsonData: jsonData,
          type: FileType.POWERPOINT,
          metadata: jsonData
        };
      } else {
        // 对于旧版.ppt文件，Node.js没有原生支持
        return {
          success: false,
          error: '旧版PowerPoint文档(.ppt)格式无法直接解析，请转换为.pptx格式',
          type: FileType.POWERPOINT
        };
      }
    } catch (e) {
      return {
        success: false,
        error: `解析过程中发生错误: ${e.message}`,
        type: FileType.POWERPOINT
      };
    }
  }

  /**
   * 预处理PDF文档
   */
  static async _preprocessPdf(fileBuffer, fileName) {
    try {
      // 检查是否是有效的PDF文件
      let isValidPdf = false;
      if (fileBuffer.length >= 4) {
        const magic = fileBuffer.slice(0, 4).toString();
        isValidPdf = magic === '%PDF';
      }

      // 尝试使用pdfjs-extract提取PDF文本
      try {
        const pdfjsLib = require('pdfjs-dist');
        const pdfData = new Uint8Array(fileBuffer);
        const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

        let fullText = '';
        const pages = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map(item => item.str).join(' ');
          fullText += pageText + '\n';
          pages.push({
            pageNumber: i,
            content: pageText
          });
        }

        // 提取内部文本内容预览
        let textPreview = fullText;
        if (fullText.length > 2000) {
          textPreview = `${fullText.substring(0, 2000)}
... (content truncated, total ${fullText.length} characters)`;
        }

        // 结构化返回PDF文档数据
        const jsonData = {
          type: 'pdf',
          format: 'pdf',
          fileName: fileName,
          fileSize: fileBuffer.length,
          isValid: isValidPdf,
          pageCount: pdf.numPages,
          textContent: fullText,
          textContentPreview: textPreview,
          metadata: { created: new Date().toISOString() },
          pages: pages
        };

        return {
          success: true,
          jsonData: jsonData,
          type: FileType.PDF,
          metadata: jsonData
        };
      } catch (pdfError) {
        loggerService.error('PDF解析错误', pdfError);

        // 尝试估算页数（基于EOF标记的数量）
        let pageCount = 0;
        for (let i = 0; i < fileBuffer.length - 4; i++) {
          if (fileBuffer[i] === 0x25 && // %
            fileBuffer[i + 1] === 0x45 && // E
            fileBuffer[i + 2] === 0x4F && // O
            fileBuffer[i + 3] === 0x46) { // F
            pageCount++;
          }
        }

        // 尝试提取文本内容预览（简单方法）
        let textPreview = '';
        if (fileBuffer.length > 0) {
          // 取前2000字节尝试解码为文本
          const previewBytes = fileBuffer.length > 2000
            ? fileBuffer.slice(0, 2000)
            : fileBuffer;
          textPreview = previewBytes.toString('utf-8');
          // 移除非打印字符
          textPreview = textPreview.replace(/[^\x20-\x7E\x0A\x0D\t]/g, '');
        }

        return {
          success: false,
          error: `解析过程中发生错误: ${pdfError.message}`,
          type: FileType.PDF
        };
      }
    } catch (e) {
      return {
        success: false,
        error: `解析过程中发生错误: ${e.message}`,
        type: FileType.PDF
      };
    }
  }

  /**
   * 预处理文本文件（包括CSV文件）
   */
  static async _preprocessText(fileBuffer, fileName) {
    try {
      // 解码文本内容
      let content = fileBuffer.toString('utf-8');

      // 移除BOM标记（如果存在）
      if (content.startsWith('\uFEFF')) {
        content = content.substring(1);
      }

      // 对于CSV文件，保留全部内容
      if (fileName.toLowerCase().endsWith('.csv')) {
        // CSV文件不需要特殊处理，保留全部内容即可
        // 可以在这里添加特殊的CSV处理逻辑（如格式化等），但目前只需保留原始内容
      }

      // 截断过长的内容
      let truncatedContent = content;
      if (content.length > 10000) {
        truncatedContent = `${content.substring(0, 10000)}
... (content truncated, total ${content.length} characters)`;
      }

      // 结构化返回文本文档数据
      const jsonData = {
        type: 'text',
        format: fileName.toLowerCase().endsWith('.csv') ? 'csv' : 'txt',
        fileName: fileName,
        fileSize: fileBuffer.length,
        textContent: content,  // 全部内容作为文本内容
        textContentPreview: truncatedContent,
        lineCount: content.split('\n').length,
        wordCount: content
          .split(/\s+/)
          .filter((s) => s.trim() !== '').length,
        characterCount: content.length,
      };

      return {
        success: true,
        jsonData: jsonData,
        type: FileType.TEXT,
        metadata: jsonData
      };
    } catch (e) {
      return {
        success: false,
        error: `解析过程中发生错误: ${e.message}`,
        type: FileType.TEXT
      };
    }
  }

  /**
   * 预处理Markdown文档
   */
  static async _preprocessMarkdown(fileBuffer, fileName) {
    try {
      // 解码文本内容
      let content = fileBuffer.toString('utf-8');

      // 移除BOM标记（如果存在）
      if (content.startsWith('\uFEFF')) {
        content = content.substring(1);
      }

      // 截断过长的内容
      let truncatedContent = content;
      if (content.length > 10000) {
        truncatedContent = `${content.substring(0, 10000)}
... (content truncated, total ${content.length} characters)`;
      }

      // 结构化返回Markdown文档数据
      const jsonData = {
        type: 'markdown',
        format: 'md',
        fileName: fileName,
        fileSize: fileBuffer.length,
        textContent: content,
        textContentPreview: truncatedContent,
        lineCount: content.split('\n').length,
        wordCount: content
          .split(/\s+/)
          .filter((s) => s.trim() !== '').length,
        characterCount: content.length,
      };

      return {
        success: true,
        jsonData: jsonData,
        type: FileType.MARKDOWN,
        metadata: jsonData
      };
    } catch (e) {
      return {
        success: false,
        error: `解析过程中发生错误: ${e.message}`,
        type: FileType.MARKDOWN
      };
    }
  }

  /**
   * 从XML中提取纯文本
   */
  static _extractTextFromXml(xmlContent) {
    // 首先尝试更智能的提取方式
    let textContent = xmlContent;
    
    // 替换常见的XML实体
    textContent = textContent.replace(/&lt;/g, '<');
    textContent = textContent.replace(/&gt;/g, '>');
    textContent = textContent.replace(/&amp;/g, '&');
    textContent = textContent.replace(/&quot;/g, '"');
    textContent = textContent.replace(/&#39;/g, "'");
    
    // 提取w:t标签中的文本（Word文档中的文本内容）
    // 匹配 <w:t>...</w:t> 和 <w:t >...</w:t> 等可能的变体
    const textMatches = textContent.match(/<w:t[^>]*>(.*?)<\/w:t>/gs) || [];
    const extractedTexts = [];
    
    for (const match of textMatches) {
      // 提取标签内的内容
      const innerText = (match.match(/<w:t[^>]*>(.*?)<\/w:t>/s) || [])[1] || '';
      // 解码XML实体
      let decodedText = innerText
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (match, num) => String.fromCharCode(num));
      
      // 移除XML命名空间前缀可能产生的额外字符
      decodedText = decodedText.replace(/<[^>]*>/g, '');
      
      if (decodedText.trim() !== '') {
        extractedTexts.push(decodedText.trim());
      }
    }
    
    // 如果提取到了文本内容，使用这些内容
    if (extractedTexts.length > 0) {
      textContent = extractedTexts.join(' ');
    } else {
      // 如果没有提取到w:t标签，尝试更通用的提取方法
      // 查找所有Word文本相关的标签
      const allTextMatches = textContent.match(/<w:([^>]+)>([^<]*)<\/w:([^>]+)>/g) || [];
      const allTexts = [];
      
      for (const match of allTextMatches) {
        const innerText = match.replace(/<[^>]*>/g, '');
        if (innerText.trim() !== '') {
          allTexts.push(innerText.trim());
        }
      }
      
      if (allTexts.length > 0) {
        textContent = allTexts.join(' ');
      } else {
        // 否则使用简单的标签移除方法
        textContent = xmlContent.replace(/<[^>]*>/g, '');
        textContent = textContent.replace(/&lt;/g, '<');
        textContent = textContent.replace(/&gt;/g, '>');
        textContent = textContent.replace(/&amp;/g, '&');
        textContent = textContent.replace(/&quot;/g, '"');
        textContent = textContent.replace(/&#39;/g, "'");

        // 清理多余空白字符
        textContent = textContent.replace(/\s+/g, ' ');
      }
    }
    
    return textContent.trim();
  }

  /**
   * 从XML中提取元数据
   */
  static _extractMetadataFromXml(xmlContent) {
    const metadata = {};

    // 提取常见元数据字段
    const titleMatch = xmlContent.match(/<dc:title>(.*?)<\/dc:title>/);
    if (titleMatch) {
      metadata.title = titleMatch[1];
    }

    const creatorMatch = xmlContent.match(/<dc:creator>(.*?)<\/dc:creator>/);
    if (creatorMatch) {
      metadata.creator = creatorMatch[1];
    }

    const createdMatch = xmlContent.match(/<dcterms:created[^>]*>(.*?)<\/dcterms:created>/);
    if (createdMatch) {
      metadata.created = createdMatch[1];
    }

    return metadata;
  }

  /**
   * 从共享字符串XML中提取字符串列表
   */
  static _extractSharedStringsFromXml(xmlContent) {
    const strings = [];

    // 查找所有共享字符串项 <si>...</si>
    const siMatches = xmlContent.match(/<si>(.*?)<\/si>/gs) || [];

    for (const siMatch of siMatches) {
      const siContent = (siMatch.match(/<si>(.*?)<\/si>/s) || [])[1] || '';

      // 查找 <t> 标签中的文本
      const tMatch = siContent.match(/<t[^>]*>(.*?)<\/t>/s);
      if (tMatch) {
        let text = tMatch[1] || '';
        // 处理转义字符
        text = text.replace(/&lt;/g, '<');
        text = text.replace(/&gt;/g, '>');
        text = text.replace(/&amp;/g, '&');
        text = text.replace(/&quot;/g, '"');
        text = text.replace(/&#39;/g, "'");
        strings.push(text);
      } else {
        // 如果没有 <t> 标签，可能是复杂的富文本格式
        // 尝试提取所有文本内容
        const textNodes = siContent.match(/>[^<]+</g) || [];
        const richText = textNodes.map(match => match.substring(1, match.length - 1)).join('').trim();
        if (richText) {
          strings.push(richText);
        } else {
          strings.push('');
        }
      }
    }

    return strings;
  }

  /**
   * 从工作簿XML中提取工作表名称
   */
  static _extractSheetNamesFromXml(xmlContent) {
    const sheetNames = [];
    const matches = xmlContent.match(/<sheet[^>]*name="(.*?)"/g) || [];

    for (const match of matches) {
      const nameMatch = match.match(/name="(.*?)"/);
      if (nameMatch) {
        sheetNames.push(nameMatch[1] || '');
      }
    }

    return sheetNames;
  }

  /**
   * 将Excel内容转换为CSV格式
   */
  static async _buildCsvFromExcelContent(zip, sharedStrings) {
    try {
      // 遍历所有工作表
      for (const [filename, file] of Object.entries(zip.files)) {
        if (filename.startsWith('xl/worksheets/sheet') &&
          filename.endsWith('.xml')) {

          const xmlContent = await file.async('text');  // 修复：添加await关键字
          // 解析工作表数据并转换为CSV
          return await this._parseWorksheetToCsv(xmlContent, sharedStrings);  // 修复：添加await关键字
        }
      }
    } catch (e) {
      loggerService.error('构建CSV内容时出错', e);
    }

    return '';
  }

  /**
   * 解析工作表XML并转换为CSV格式
   */
  static async _parseWorksheetToCsv(xmlContent, sharedStrings) {
    try {
      const rows = [];

      // 查找所有的行 <row>...</row>
      const rowMatches = (await xmlContent).match(/<row[^>]*>(.*?)<\/row>/gs) || [];

      for (const rowMatch of rowMatches) {
        const rowContent = (rowMatch.match(/<row[^>]*>(.*?)<\/row>/s) || [])[1] || '';
        const cells = [];

        // 查找行内的所有单元格 <c>...</c>
        // 注意：单元格可能有引用属性，如 r="A1" t="s" 等
        const cellMatches = rowContent.match(/<c[^>]*>(.*?)<\/c>/gs) || [];

        for (const cellMatch of cellMatches) {
          const cellContent = (cellMatch.match(/<c[^>]*>(.*?)<\/c>/s) || [])[1] || '';

          // 查找直接文本 <t>...</t>
          const tMatch = cellContent.match(/<t[^>]*>(.*?)<\/t>/s);
          if (tMatch) {
            let text = tMatch[1] || '';
            // 处理转义字符
            text = text.replace(/&lt;/g, '<');
            text = text.replace(/&gt;/g, '>');
            text = text.replace(/&amp;/g, '&');
            text = text.replace(/&quot;/g, '"');
            text = text.replace(/&#39;/g, "'");
            cells.push(text.trim());
            continue;
          }

          // 查找内联字符串 <is><t>...</t></is>
          const isMatch = cellContent.match(/<is><t[^>]*>(.*?)<\/t><\/is>/s);
          if (isMatch) {
            let text = isMatch[1] || '';
            // 处理转义字符
            text = text.replace(/&lt;/g, '<');
            text = text.replace(/&gt;/g, '>');
            text = text.replace(/&amp;/g, '&');
            text = text.replace(/&quot;/g, '"');
            text = text.replace(/&#39;/g, "'");
            cells.push(text.trim());
            continue;
          }

          // 查找数值引用 <v>...</v>
          const vMatch = cellContent.match(/<v[^>]*>(.*?)<\/v>/s);
          if (vMatch) {
            let value = vMatch[1] || '';
            try {
              const index = parseInt(value.trim());
              if (index >= 0 && index < sharedStrings.length) {
                cells.push(sharedStrings[index]);
              } else {
                // 检查单元格是否有类型属性 t="s" 表示共享字符串
                // 如果是共享字符串但索引无效，则添加空字符串
                // 否则添加数值本身
                cells.push(value.trim());
              }
            } catch (e) {
              cells.push(value.trim());
            }
            continue;
          }

          // 如果都没有找到，添加空字符串
          cells.push('');
        }

        if (cells.length > 0) {
          rows.push(cells);
        }
      }

      // 将行数据转换为CSV格式
      const csvLines = [];
      for (const row of rows) {
        const csvCells = row.map((cell) => {
          // 如果单元格包含逗号、换行符或双引号，则需要用双引号包围并转义双引号
          if (cell.includes(',') || cell.includes('\n') || cell.includes('"')) {
            return `"${cell.replace(/"/g, '""')}"`;
          }
          return cell;
        }).join(',');
        csvLines.push(csvCells);
      }

      return csvLines.join('\n');
    } catch (e) {
      loggerService.error('解析工作表为CSV时出错', e);
      return '';
    }
  }
}

module.exports = { DocumentConverter };