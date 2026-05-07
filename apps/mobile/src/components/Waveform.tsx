import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { theme } from '../theme';
import { useMeter, WAVEFORM_BARS } from '../features/dictation/useDictation';

interface Props {
  /** When false the bars collapse to a flat resting line. */
  active: boolean;
}

const MIN_HEIGHT = 4;
const MAX_HEIGHT = 64;
const RESTING_HEIGHT = 4;

/**
 * 28-bar audio meter. Reads RMS samples from the meter store, scales them
 * to bar heights with a logarithmic curve so quiet speech still shows up,
 * and animates the heights via React Native's `Animated` API for buttery
 * 60 fps without re-rendering the parent on every frame.
 */
export function Waveform({ active }: Props) {
  const levels = useMeter((s) => s.levels);

  // Persistent Animated.Value per bar.
  const heights = useRef<Animated.Value[]>(
    Array.from({ length: WAVEFORM_BARS }, () => new Animated.Value(RESTING_HEIGHT)),
  ).current;

  useEffect(() => {
    // Right-align: pad with 0s so the latest sample is always the rightmost bar.
    const padded = new Array<number>(WAVEFORM_BARS - levels.length).fill(0).concat(levels);
    heights.forEach((h, i) => {
      const rms = padded[i] ?? 0;
      const target = active
        ? Math.min(MAX_HEIGHT, MIN_HEIGHT + Math.sqrt(rms) * MAX_HEIGHT * 2.4)
        : RESTING_HEIGHT;
      Animated.timing(h, {
        toValue: target,
        duration: 90,
        useNativeDriver: false,
      }).start();
    });
  }, [levels, active, heights]);

  return (
    <View style={styles.row} accessible accessibilityLabel="Audio level meter">
      {heights.map((h, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              height: h,
              backgroundColor: active ? theme.colors.accent : theme.colors.border,
              opacity: active ? 1 : 0.6,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: MAX_HEIGHT + 8,
    gap: 3,
  },
  bar: {
    width: 4,
    borderRadius: 2,
  },
});
