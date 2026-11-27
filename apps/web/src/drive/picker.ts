/**
 * Seletor de arquivos do Google (Picker) para "Abrir do Drive". Com o escopo `drive.file`, o
 * Picker mostra o Drive da pessoa e, ao escolher um arquivo, libera esse arquivo para o app.
 * O script do Google (`apis.google.com/js/api.js`) só carrega quando a pessoa clica.
 */

const SCRIPT_URL = 'https://apis.google.com/js/api.js';

/** Abre o seletor e devolve o id do arquivo escolhido (ou null se a pessoa cancelou). */
export type PickDriveFile = (options: { accessToken: string }) => Promise<string | null>;

interface PickerDoc {
  id: string;
}
interface PickerResponse {
  action: string;
  docs?: PickerDoc[];
}
interface PickerBuilder {
  addView(view: unknown): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  setLocale(locale: string): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  setCallback(callback: (response: PickerResponse) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
}
interface GooglePicker {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new () => { setMimeTypes(types: string): unknown; setIncludeFolders(on: boolean): unknown };
  Action: { PICKED: string; CANCEL: string };
}
interface GoogleWindow {
  gapi?: { load(name: string, options: { callback: () => void; onerror: () => void }): void };
  google?: { picker?: GooglePicker };
}

let loading: Promise<GooglePicker> | null = null;

function loadPicker(): Promise<GooglePicker> {
  loading ??= new Promise<GooglePicker>((resolve, reject) => {
    const fail = () => {
      loading = null;
      reject(new Error('Não deu para carregar o seletor do Google Drive.'));
    };
    const ready = () => {
      const win = window as unknown as GoogleWindow;
      const gapi = win.gapi;
      if (!gapi) return fail();
      gapi.load('picker', {
        callback: () => {
          const picker = (window as unknown as GoogleWindow).google?.picker;
          if (picker) resolve(picker);
          else fail();
        },
        onerror: fail,
      });
    };
    if ((window as unknown as GoogleWindow).gapi) return ready();
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = ready;
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Monta o Picker real. `apiKey` é a chave de API restrita ao Picker e `appId` o número do projeto
 * no Google Cloud (a primeira parte do ID do cliente OAuth).
 */
export function createPicker({ apiKey, appId }: { apiKey: string; appId: string }): PickDriveFile {
  return async ({ accessToken }) => {
    const picker = await loadPicker();
    return new Promise<string | null>((resolve) => {
      // O `projeto.trama` é guardado como JSON.
      const view = new picker.DocsView();
      view.setMimeTypes('application/json');
      new picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .setDeveloperKey(apiKey)
        .setAppId(appId)
        .setLocale('pt-BR')
        .setTitle('Escolha um projeto.trama')
        .setCallback((response) => {
          if (response.action === picker.Action.PICKED) resolve(response.docs?.[0]?.id ?? null);
          else if (response.action === picker.Action.CANCEL) resolve(null);
        })
        .build()
        .setVisible(true);
    });
  };
}

/** O número do projeto do Google Cloud está no começo do ID do cliente OAuth ("123-abc.apps..."). */
export function appIdFromClientId(clientId: string | undefined): string | undefined {
  const prefix = clientId?.split('-')[0];
  return prefix && /^\d+$/.test(prefix) ? prefix : undefined;
}
