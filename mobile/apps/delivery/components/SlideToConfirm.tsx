import React, { useRef, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, Text, View } from 'react-native';
import { COLORS, themedStyles } from './ui';

const KNOB = 52;
const PADDING = 4;

/**
 * Curseur « glisser pour valider » : un geste volontaire, qu'une poche ou un
 * doigt qui passe ne déclenche pas. Relâché avant le bout, il revient.
 */
export default function SlideToConfirm({
  label,
  onConfirm,
  disabled,
  loading,
  color = COLORS.success,
}: {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
  loading?: boolean;
  color?: string;
}) {
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const max = Math.max(0, width - KNOB - PADDING * 2);
  const state = useRef({ max, disabled, loading, onConfirm });
  state.current = { max, disabled, loading, onConfirm };

  const reset = () => Animated.spring(x, { toValue: 0, useNativeDriver: false }).start();

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !state.current.disabled && !state.current.loading,
      onMoveShouldSetPanResponder: () => !state.current.disabled && !state.current.loading,
      onPanResponderMove: (_, g) => x.setValue(Math.min(Math.max(0, g.dx), state.current.max)),
      onPanResponderRelease: (_, g) => {
        if (state.current.max > 0 && g.dx >= state.current.max * 0.9) {
          Animated.timing(x, { toValue: state.current.max, duration: 80, useNativeDriver: false }).start(() => {
            state.current.onConfirm();
            setTimeout(reset, 600);
          });
        } else {
          reset();
        }
      },
      onPanResponderTerminate: reset,
    })
  ).current;

  const textOpacity = max > 0 ? x.interpolate({ inputRange: [0, max], outputRange: [1, 0.1] }) : 1;

  return (
    <View
      style={[styles.track, { backgroundColor: disabled ? COLORS.raised : color }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <Animated.Text style={[styles.label, disabled && { color: COLORS.muted }, { opacity: textOpacity }]} numberOfLines={1}>
        {label}
      </Animated.Text>
      <Animated.View
        style={[styles.knob, disabled && { backgroundColor: COLORS.card }, { transform: [{ translateX: x }] }]}
        {...responder.panHandlers}
      >
        {loading ? <ActivityIndicator color={color} /> : <Text style={[styles.arrow, { color: disabled ? COLORS.muted : color }]}>»</Text>}
      </Animated.View>
    </View>
  );
}

const styles = themedStyles(() => ({
  track: {
    height: KNOB + PADDING * 2,
    borderRadius: (KNOB + PADDING * 2) / 2,
    justifyContent: 'center',
    padding: PADDING,
  },
  label: {
    position: 'absolute',
    left: KNOB + 16,
    right: 16,
    textAlign: 'center',
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  arrow: { fontSize: 26, fontWeight: '800', marginTop: -2 },
}));
