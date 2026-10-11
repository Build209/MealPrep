import { Image, Text, View } from 'react-native';
import { THEME } from '../../config/appConfig';
import { HydrationSafeIonicon } from '../HydrationSafeIonicon';
import { initials } from '../../lib/initials';

type ProfileAvatarProps = {
  name: string;
  photoUrl: string | null;
  size?: number;
  guest?: boolean;
  /** On the green header: no fill of its own, cream icon and initials. */
  onHeader?: boolean;
};

export function ProfileAvatar({ name, photoUrl, size = 32, guest = false, onHeader = false }: ProfileAvatarProps) {
  const dimension = { width: size, height: size, borderRadius: size / 2 };

  if (photoUrl?.trim()) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={dimension}
        accessibilityIgnoresInvertColors
        accessibilityLabel={guest ? 'Account' : `Profile photo for ${name}`}
      />
    );
  }

  if (guest) {
    return (
      <View
        style={dimension}
        className={`items-center justify-center ${onHeader ? '' : 'border border-on-primary-muted/40 bg-slate'}`}
        accessibilityLabel="Guest account"
      >
        <HydrationSafeIonicon
          name="person-outline"
          size={onHeader ? 22 : size * 0.5}
          color={onHeader ? THEME.onBanana : THEME.onPrimaryMuted}
        />
      </View>
    );
  }

  return (
    <View style={dimension} className={`items-center justify-center ${onHeader ? '' : 'bg-primary'}`}>
      <Text className={`font-extrabold ${onHeader ? 'text-on-banana' : 'text-on-primary'}`} style={{ fontSize: size * 0.38 }}>
        {initials(name)}
      </Text>
    </View>
  );
}
