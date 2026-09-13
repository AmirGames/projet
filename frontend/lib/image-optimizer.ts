export const imageOptimizer = {
  getOptimizedUrl(url: string, width?: number, quality: number = 75): string {
    if (!url) return '';
    
    // For local/relative URLs, return as is
    if (url.startsWith('/') || url.startsWith('.')) {
      return url;
    }
    
    // For external URLs with width optimization
    if (width) {
      return `${url}?w=${width}&q=${quality}`;
    }
    
    return url;
  },

  getResponsiveImageSrcSet(url: string): string {
    if (!url) return '';
    
    return [
      `${this.getOptimizedUrl(url, 400)} 400w`,
      `${this.getOptimizedUrl(url, 800)} 800w`,
      `${this.getOptimizedUrl(url, 1200)} 1200w`,
    ].join(', ');
  },

  getLazyLoadPlaceholder(width: number, height: number): string {
    // Return base64 placeholder
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'%3E%3Crect fill='%23e5e7eb' width='${width}' height='${height}'/%3E%3C/svg%3E`;
  },
};
