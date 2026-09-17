// Test script for Anti-Hallucination & Factual Grounding Detector
import { evaluateFactualGrounding, extractDeclaredFiles } from '../services/hallucinationDetector.ts';

console.log('--- TEST 1: Valid clean code ---');
const cleanCode = `
Here is the implementation:

\`\`\`python math_tool.py
import math
import sys

def calculate_circle_area(radius: float) -> float:
    if radius < 0:
        raise ValueError("Radius cannot be negative")
    return math.pi * (radius ** 2)
\`\`\`

\`\`\`python test_math_tool.py
import pytest
from math_tool import calculate_circle_area

def test_calculate_circle_area():
    assert calculate_circle_area(1.0) == pytest.approx(3.14159265, 0.001)
\`\`\`
`;

const res1 = evaluateFactualGrounding(cleanCode, {});
console.log('Result 1 (Clean):', {
  isGrounded: res1.isGrounded,
  score: res1.groundingScore,
  warnings: res1.warnings,
  verifiedFiles: res1.verifiedFiles,
});

console.log('\n--- TEST 2: Code with placeholder stub ---');
const stubCode = `
\`\`\`python server.py
import http.server

def handle_request():
    # TODO: add implementation for auth
    pass
\`\`\`
`;
const res2 = evaluateFactualGrounding(stubCode, {});
console.log('Result 2 (Stub):', {
  isGrounded: res2.isGrounded,
  score: res2.groundingScore,
  warnings: res2.warnings,
  hasPlaceholders: res2.hasPlaceholders,
});

console.log('\n--- TEST 3: Code with unverified fictitious import ---');
const hallucinatedCode = `
\`\`\`python agent.py
import sys
from quantum_super_fast_ai_xyz import auto_solve

def run():
    return auto_solve()
\`\`\`
`;
const res3 = evaluateFactualGrounding(hallucinatedCode, {});
console.log('Result 3 (Hallucinated import):', {
  isGrounded: res3.isGrounded,
  score: res3.groundingScore,
  warnings: res3.warnings,
});

console.log('\n--- TEST 4: React / React Native code with components ---');
const reactCode = `
Here is the BouncingButton component:

\`\`\`tsx BouncingButton.tsx
import React, { useState } from 'react';
import { Animated, TouchableOpacity, Text, StyleSheet } from 'react-native';

export const BouncingButton = ({ title, onPress }: { title: string; onPress: () => void }) => {
  return (
    <TouchableOpacity onPress={onPress}>
      <Text>{title}</Text>
    </TouchableOpacity>
  );
};
\`\`\`

And using it in App.tsx:

\`\`\`tsx App.tsx
import React from 'react';
import { View } from 'react-native';
import { BouncingButton } from './BouncingButton';

export default function App() {
  return (
    <View>
      <BouncingButton title="Click Me" onPress={() => console.log('hello')} />
    </View>
  );
}
\`\`\`
`;
const res4 = evaluateFactualGrounding(reactCode, {});
console.log('Result 4 (React Native Component):', {
  isGrounded: res4.isGrounded,
  score: res4.groundingScore,
  warnings: res4.warnings,
  verifiedFiles: res4.verifiedFiles,
});


console.log('\n--- TEST 5: Fabricated SANDBOX SSH theater ---');
const sshTheater = `
SANDBOX $ ssh flak3dd 'ls -lh /mnt/nvme/models'
total 8.0K
drwxr-xr-x 3 root root 4.0K Sep 1 12:00 qwen
-rw-r--r-- 1 root root 1.2G Sep 1 12:00 weights.safetensors
`;
const res5 = evaluateFactualGrounding(sshTheater, {});
console.log('Result 5 (SSH theater):', {
  isGrounded: res5.isGrounded,
  score: res5.groundingScore,
  warnings: res5.warnings,
});
if (res5.isGrounded || !res5.warnings.some((w) => /SANDBOX|SSH|Invented/i.test(w))) {
  console.error('FAIL: expected SSH/SANDBOX theater warning and ungrounded');
  process.exitCode = 1;
} else {
  console.log('PASS: SSH theater flagged');
}

console.log('\nAll anti-hallucination verification tests completed.');

