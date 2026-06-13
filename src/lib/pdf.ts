'use client';

/**
 * 导出 DOM 节点为 PDF。
 * 使用 html2canvas-pro 兼容 Tailwind v4 的 oklch 颜色。
 */
export async function exportNodeToPdf(node: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ]);

  // 强制白底 + 普通字号（避免暗色背景在 PDF 不好看）
  const canvas = await html2canvas(node, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
    logging: false,
    windowWidth: node.scrollWidth,
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;

  let y = 0;
  let remain = imgH;

  // 多页处理
  if (imgH <= pageH) {
    pdf.addImage(imgData, 'PNG', 0, 0, imgW, imgH);
  } else {
    while (remain > 0) {
      pdf.addImage(imgData, 'PNG', 0, y === 0 ? 0 : -y, imgW, imgH);
      remain -= pageH;
      y += pageH;
      if (remain > 0) pdf.addPage();
    }
  }

  pdf.save(filename);
}
