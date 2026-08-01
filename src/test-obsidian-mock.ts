export class TFile {
  path: string;
  extension: string;
  basename: string;

  constructor(path: string) {
    this.path = path;
    this.extension = path.split('.').pop() || '';
    this.basename = path.split('/').pop()?.replace(/\.[^.]+$/, '') || path;
  }
}

export class Modal {}
export class Menu {}
export class Notice {}
export const normalizePath = (value: string) => value;
export const setIcon = () => {};
