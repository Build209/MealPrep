import { Pressable, Text, View } from 'react-native';
import { Modal } from './BackAwareModal';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable className="flex-1 items-center justify-center bg-black/50 px-6" onPress={onCancel}>
        <Pressable
          className="w-full max-w-md rounded-2xl border border-border bg-paper p-5"
          onPress={(event) => event.stopPropagation()}
        >
          <Text className="text-lg font-bold text-ink">{title}</Text>
          <Text className="mt-2 text-sm leading-5 text-muted">{message}</Text>
          <View className="mt-5 flex-row gap-2">
            <Pressable
              disabled={loading}
              onPress={onCancel}
              className="flex-1 rounded-xl border border-border py-3"
            >
              <Text className="text-center text-sm font-bold text-slate">{cancelLabel}</Text>
            </Pressable>
            <Pressable
              disabled={loading}
              onPress={onConfirm}
              className={`flex-1 rounded-full py-3 ${destructive ? 'bg-danger' : 'bg-primary'} ${loading ? 'opacity-60' : ''}`}
            >
              <Text className={`text-center text-sm font-bold ${destructive ? 'text-paper' : 'text-on-primary'}`}>
                {loading ? 'Working…' : confirmLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
