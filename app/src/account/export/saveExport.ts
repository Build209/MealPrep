import { Platform, Share } from 'react-native';
import { dataUrlFor, type ExportFile } from './exportKitchen';

/**
 * Gives the person the file. On the web it is a normal browser download. On a phone app there is
 * no file-saving library in the project, so it opens the system share sheet with the text (the
 * person can send it to Notes, Files or email). The native path has not been run on a device.
 */
export async function saveExport(file: ExportFile, shareTitle: string): Promise<void> {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const link = document.createElement('a');
    link.href = dataUrlFor(file);
    link.download = file.filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return;
  }
  await Share.share({ title: shareTitle, message: file.content });
}
