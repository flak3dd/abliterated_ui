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

console.log('\nAll anti-hallucination verification tests completed.');
