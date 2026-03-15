declare module "@tloncorp/api" {
  export type TlonApiClientConfig = {
    shipUrl: string;
    shipName: string;
    verbose?: boolean;
    getCode: () => Promise<string>;
  };

  export type UploadFileParams = {
    blob: Blob;
    fileName: string;
    contentType: string;
  };

  export type UploadFileResult = {
    url: string;
  };

  export function configureClient(config: TlonApiClientConfig): void;
  export function uploadFile(params: UploadFileParams): Promise<UploadFileResult>;
}
