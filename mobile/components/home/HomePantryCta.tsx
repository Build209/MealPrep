import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { APP_ROUTES } from '../../config/appRoutes';
import { RECIPES_COPY } from '../../config/recipesCopy';
import { THEME } from '../../config/appConfig';
import { Ionicons } from '../../lib/icons/Ionicons';

/**
 * Home with an empty pantry (sticker aisle look): the banana bar carries on down the screen,
 * Forky asks for one photo, and one tomato button leads to the scanner on the Pantry tab.
 * This is the only tomato button on the screen.
 *
 * Forky himself is not drawn here: he already stands in the top bar right above this card (and
 * the first-time tour points at him there), so a second one made two Forkys on one screen.
 */
export function HomePantryCta() {
  const { heading, description, buttonLabel } = RECIPES_COPY.homePantryPrompt;
  const [pressed, setPressed] = useState(false);

  const buttonStyle = {
    backgroundColor: pressed ? THEME.tomatoDark : THEME.tomato,
    transform: [{ scale: pressed ? 0.96 : 1 }],
  };

  return (
    <View className="-mx-5 bg-banana px-5 pb-6">
      <View className="pt-4">
        <Text accessibilityRole="header" className="font-display text-[34px] leading-[35px] text-on-banana">
          {heading}
        </Text>
        <Text className="mt-2 text-base leading-6 text-on-banana">{description}</Text>
      </View>
      <Pressable
        onPress={() => router.push(APP_ROUTES.pantry)}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        accessibilityRole="button"
        accessibilityLabel={buttonLabel}
        className="mt-3 min-h-[60px] flex-row items-center justify-center gap-2.5 rounded-2xl px-5"
        style={buttonStyle}
      >
        <Ionicons name="camera-outline" size={24} color={THEME.onTomato} />
        <Text className="text-lg font-extrabold text-on-tomato">{buttonLabel}</Text>
      </Pressable>
    </View>
  );
}
