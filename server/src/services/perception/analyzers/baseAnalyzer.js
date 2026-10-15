/**
 * Base analyzer interface for all media types
 */
export class BaseAnalyzer {
  constructor(mediaType) {
    this.mediaType = mediaType;
  }

  /**
   * Main analysis execution method
   * @param {string} mediaId 
   * @param {string} filePath 
   * @param {object} [options] 
   * @returns {Promise<{ meta: object, perception: object }>}
   */
  async analyze(mediaId, filePath, options = {}) {
    throw new Error(`analyze() must be implemented by ${this.constructor.name}`);
  }
}
