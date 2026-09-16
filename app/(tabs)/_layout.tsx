import React from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet, Platform, View, useWindowDimensions } from 'react-native';
import { MessageSquare, Sparkles, Radio, CreditCard } from 'lucide-react-native';
import Colors from '../../theme/colors';
import { isDesktopWeb } from '../../theme/layout';

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = isDesktopWeb(width);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.brand.emerald,
        tabBarInactiveTintColor: Colors.text.tertiary,
        tabBarStyle: isDesktop ? { display: 'none' } : styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.activeIconWrap : undefined}>
              <MessageSquare size={20} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="studio"
        options={{
          title: 'Studio',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.activeIconWrap : undefined}>
              <Sparkles size={20} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="id-studio"
        options={{
          title: 'ID Studio',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.activeIconWrap : undefined}>
              <CreditCard size={20} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="radar"
        options={{
          title: 'Radar',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused ? styles.activeIconWrap : undefined}>
              <Radio size={20} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="telemetry"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.background.primary,
    borderTopWidth: 1,
    borderTopColor: Colors.border.default,
    height: Platform.OS === 'ios' ? 84 : 64,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 28 : 10,
    elevation: 0,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: -0.1,
  },
  tabBarItem: {
    paddingVertical: 2,
  },
  activeIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
