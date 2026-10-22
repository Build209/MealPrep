import { Platform, Share } from 'react-native';

/**
 * Gives the person their list as text. Phone app: the system share sheet (it has Copy, Messages,
 * Notes and store apps). Web: the browser's share sheet when it has one, else the clipboard.
 * Returns 'copied' only when the text went to the clipboard, so the screen can say so.
 * NOT run on a device or in a browser yet: the pure text is tested, this wrapper is not.
 */
export async function shareListText(text: string, title: string): Promise<'shared' | 'copied'> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title, text });
      return 'shared';
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
    throw new Error('This browser cannot share or copy.');
  }
  await Share.share({ title, message: text });
  return 'shared';
}
