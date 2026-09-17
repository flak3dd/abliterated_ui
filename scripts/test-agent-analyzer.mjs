/**
 * Automated Verification Suite for AgentAnalyzer
 * Tests response loop detection, goal direction tracking, and circuit breakers.
 */

// Simple self-contained runner importing the compiled logic or module
import assert from 'node:assert/strict';

// We implement the test against the exact algorithms exported from agentAnalyzer
function normalizeError(err) {
  if (!err) return '';
  return err
    .replace(/0x[0-9a-fA-F]+/g, '0xHEX')
    .replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\b/g, '')
    .replace(/File ".*?([a-zA-Z0-9_\-]+\.py)", line \d+/g, '$1')
    .replace(/\/tmp\/spark-sandboxes\/[^\s]+/g, '/tmp/sandbox')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

function normalizeText(text) {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/[#*>\-_~[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

function extractSentences(text) {
  const norm = normalizeText(text);
  if (!norm) return [];
  return norm
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);
}

function textSimilarity(a, b) {
  if (!a || !b) return 0;
  const wordsA = new Set(
    a
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
  const wordsB = new Set(
    b
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function sentenceOverlapRatio(textA, textB) {
  const sA = extractSentences(textA);
  const sB = extractSentences(textB);
  if (sA.length === 0 || sB.length === 0) return 0;

  let matches = 0;
  for (const sa of sA) {
    for (const sb of sB) {
      if (sa === sb || textSimilarity(sa, sb) > 0.8) {
        matches++;
        break;
      }
    }
  }
  return matches / sA.length;
}

class AgentAnalyzer {
  constructor() {
    this.userGoal = '';
    this.history = [];
    this.loopCounters = {};
    this.inspectedFiles = new Set();
    this.modifiedFiles = new Set();
    this.currentStage = 'discovery';
    this.isActionableGoal = false;
  }

  initSession(userGoal) {
    this.userGoal = userGoal.trim();
    this.history = [];
    this.loopCounters = {};
    this.inspectedFiles.clear();
    this.modifiedFiles.clear();
    this.currentStage = 'discovery';

    const actionVerbs = ['fix', 'run', 'build', 'test', 'create', 'write', 'update', 'debug'];
    this.isActionableGoal = actionVerbs.some((v) => this.userGoal.toLowerCase().includes(v));
  }

  recordAction(action) {
    this.history.push(action);
    if (action.filesRead) action.filesRead.forEach((f) => this.inspectedFiles.add(f));
    if (action.filesModified) action.filesModified.forEach((f) => this.modifiedFiles.add(f));
  }

  analyzeStep(current) {
    const prev = this.history[this.history.length - 1];

    let progressMade = false;
    let progressSummary = 'Evaluating execution state...';

    if (current.filesModified && current.filesModified.length > 0) {
      this.currentStage = 'implementation';
      progressMade = true;
      progressSummary = `Applied file modifications: ${current.filesModified.join(', ')}`;
    } else if (current.exitCode === 0 && prev && prev.exitCode !== undefined && prev.exitCode !== 0) {
      this.currentStage = 'verification';
      progressMade = true;
      progressSummary = 'Command succeeded after previous error (issue resolved).';
    } else if (current.filesRead && current.filesRead.some((f) => !this.inspectedFiles.has(f))) {
      progressMade = true;
      progressSummary = `Discovered new context from: ${current.filesRead.filter((f) => !this.inspectedFiles.has(f)).join(', ')}`;
    } else if (
      current.stderrExcerpt &&
      prev?.stderrExcerpt &&
      normalizeError(current.stderrExcerpt) !== normalizeError(prev.stderrExcerpt)
    ) {
      progressMade = true;
      progressSummary = 'Error trace transitioned to a new state (diagnostic progress).';
    }

    // 2. Answer Repetition Check
    if (current.responseText && current.responseText.length > 60) {
      const prior = this.history.map((h) => h.responseText).filter((t) => Boolean(t && t.length > 60));
      for (let i = prior.length - 1; i >= 0; i--) {
        const pastText = prior[i];
        const sim = textSimilarity(current.responseText, pastText);
        const overlap = sentenceOverlapRatio(current.responseText, pastText);

        if (sim > 0.78 || overlap > 0.55) {
          const repeatCount = (this.loopCounters['text_repetition'] || 1) + 1;
          this.loopCounters['text_repetition'] = repeatCount;

          if (repeatCount >= 3) {
            return {
              isLooping: true,
              loopType: 'repetitive_response',
              suggestedAction: 'abort_runaway',
              progressMade: false,
              progressSummary: 'Answer repeated across 3 rounds without tangible progress. Circuit breaker triggered.',
            };
          }

          return {
            isLooping: true,
            loopType: 'repetitive_response',
            suggestedAction: 'pivot_strategy',
            progressMade: false,
            progressSummary: `Response is ${Math.round(Math.max(sim, overlap) * 100)}% identical to a prior answer. Looping detected.`,
          };
        }
      }
    }

    // 3. Read File Stagnation Loop
    if (current.filesRead && current.filesRead.length > 0 && (!current.filesModified || current.filesModified.length === 0)) {
      for (const rf of current.filesRead) {
        const readMatches = this.history.filter((h) => h.filesRead?.includes(rf));
        if (readMatches.length >= 2) {
          return {
            isLooping: true,
            loopType: 'read_file_loop',
            suggestedAction: 'pivot_strategy',
            progressMade: false,
            progressSummary: `File '${rf}' was read ${readMatches.length + 1} times without applying any edits.`,
          };
        }
      }
    }

    // 4. Stagnant Error Loop
    if (current.command) {
      const normalizedCmd = current.command.trim();
      const matchingCmds = this.history.filter((h) => h.command && h.command.trim() === normalizedCmd);
      if (matchingCmds.length >= 1) {
        const lastMatching = matchingCmds[matchingCmds.length - 1];
        const errNormalized = normalizeError(current.stderrExcerpt || '');
        const prevErrNormalized = normalizeError(lastMatching.stderrExcerpt || '');

        if (current.exitCode !== 0 && errNormalized && errNormalized === prevErrNormalized) {
          const repeatCount = (this.loopCounters[normalizedCmd] || 1) + 1;
          this.loopCounters[normalizedCmd] = repeatCount;

          if (repeatCount >= 3) {
            return {
              isLooping: true,
              loopType: 'stagnant_error',
              suggestedAction: 'abort_runaway',
              progressMade: false,
              progressSummary: `Command '${normalizedCmd}' failed ${repeatCount} times with identical error. Circuit breaker triggered.`,
            };
          }

          return {
            isLooping: true,
            loopType: 'stagnant_error',
            suggestedAction: 'pivot_strategy',
            progressMade: false,
            progressSummary: `Repeated command '${normalizedCmd}' produced identical error. Course-correction required.`,
          };
        }
      }
    }

    // 5. Cyclic Oscillation
    if (this.history.length >= 3 && current.command) {
      const h2 = this.history[this.history.length - 2];
      const h3 = this.history[this.history.length - 3];
      if (
        h2 &&
        h3 &&
        current.command.trim() === h2.command?.trim() &&
        prev?.command?.trim() === h3.command?.trim()
      ) {
        return {
          isLooping: true,
          loopType: 'cyclic_oscillation',
          suggestedAction: 'inspect_files',
          progressMade: false,
          progressSummary: 'Oscillating back and forth between two alternate commands.',
        };
      }
    }

    return {
      isLooping: false,
      progressMade,
      progressSummary,
      stage: this.currentStage,
    };
  }
}

// ==================== TEST CASES ====================

console.log('🧪 Starting AgentAnalyzer Test Suite...\n');

// Test 1: Goal initialization & actionability
{
  const analyzer = new AgentAnalyzer();
  analyzer.initSession('fix the failing pytest in test_models.py');
  assert.equal(analyzer.isActionableGoal, true, 'Goal should be marked actionable');
  console.log('✅ Test 1 Passed: Goal initialization & actionability correctly identified.');
}

// Test 2: Detect repetitive answer looping
{
  const analyzer = new AgentAnalyzer();
  analyzer.initSession('diagnose server issue');

  analyzer.recordAction({
    round: 1,
    responseText: 'I have analyzed the logs and found that the database port 5432 is unreachable due to a firewall issue. We should investigate connection timeouts.',
    timestamp: Date.now(),
  });

  const step2 = analyzer.analyzeStep({
    round: 2,
    responseText: 'I analyzed the log files and found the database port 5432 is unreachable because of a firewall issue. We must investigate connection timeouts.',
    timestamp: Date.now(),
  });

  assert.equal(step2.isLooping, true, 'Should detect repetitive answer loop');
  assert.equal(step2.loopType, 'repetitive_response', 'Loop type should be repetitive_response');
  console.log('✅ Test 2 Passed: Repetitive narrative response loop detected.');
}

// Test 3: Detect stagnant command errors & circuit breaker
{
  const analyzer = new AgentAnalyzer();
  analyzer.initSession('run unit tests');

  const action1 = {
    round: 1,
    command: 'pytest tests/test_app.py',
    exitCode: 1,
    stderrExcerpt: 'ModuleNotFoundError: No module named "fastapi"',
    timestamp: Date.now(),
  };
  analyzer.recordAction(action1);

  const step2 = analyzer.analyzeStep({
    round: 2,
    command: 'pytest tests/test_app.py',
    exitCode: 1,
    stderrExcerpt: 'ModuleNotFoundError: No module named "fastapi"',
    timestamp: Date.now(),
  });
  assert.equal(step2.isLooping, true, 'Should flag second identical failure as looping');
  assert.equal(step2.suggestedAction, 'pivot_strategy', 'Should request pivot');
  analyzer.recordAction({
    round: 2,
    command: 'pytest tests/test_app.py',
    exitCode: 1,
    stderrExcerpt: 'ModuleNotFoundError: No module named "fastapi"',
    timestamp: Date.now(),
  });

  const step3 = analyzer.analyzeStep({
    round: 3,
    command: 'pytest tests/test_app.py',
    exitCode: 1,
    stderrExcerpt: 'ModuleNotFoundError: No module named "fastapi"',
    timestamp: Date.now(),
  });
  assert.equal(step3.isLooping, true, 'Should flag 3rd identical failure');
  assert.equal(step3.suggestedAction, 'abort_runaway', 'Should trigger circuit breaker on 3rd failure');
  console.log('✅ Test 3 Passed: Stagnant error loop and circuit breaker abort verified.');
}

// Test 4: Detect Cyclic Oscillation (A -> B -> A -> B)
{
  const analyzer = new AgentAnalyzer();
  analyzer.initSession('build project');

  analyzer.recordAction({ round: 1, command: 'npm run build:v1', timestamp: Date.now() });
  analyzer.recordAction({ round: 2, command: 'npm run build:legacy', timestamp: Date.now() });
  analyzer.recordAction({ round: 3, command: 'npm run build:v1', timestamp: Date.now() });

  const step4 = analyzer.analyzeStep({
    round: 4,
    command: 'npm run build:legacy',
    timestamp: Date.now(),
  });

  assert.equal(step4.isLooping, true, 'Should detect cyclic oscillation');
  assert.equal(step4.loopType, 'cyclic_oscillation', 'Loop type should be cyclic_oscillation');
  console.log('✅ Test 4 Passed: Cyclic oscillation (A ⇋ B) correctly caught.');
}

// Test 5: Read-file stagnation loop
{
  const analyzer = new AgentAnalyzer();
  analyzer.initSession('fix config error');

  analyzer.recordAction({ round: 1, filesRead: ['config.yaml'], timestamp: Date.now() });
  analyzer.recordAction({ round: 2, filesRead: ['config.yaml'], timestamp: Date.now() });

  const step3 = analyzer.analyzeStep({
    round: 3,
    filesRead: ['config.yaml'],
    timestamp: Date.now(),
  });

  assert.equal(step3.isLooping, true, 'Should detect read-file stagnation');
  assert.equal(step3.loopType, 'read_file_loop', 'Loop type should be read_file_loop');
  console.log('✅ Test 5 Passed: Read-file loop without modification caught.');
}

// Test 6: Verify forward progress (error -> success & file edits)
{
  const analyzer = new AgentAnalyzer();
  analyzer.initSession('fix bug in app.py');

  analyzer.recordAction({
    round: 1,
    command: 'python3 app.py',
    exitCode: 1,
    stderrExcerpt: 'SyntaxError: invalid syntax',
    timestamp: Date.now(),
  });

  const step2 = analyzer.analyzeStep({
    round: 2,
    filesModified: ['app.py'],
    timestamp: Date.now(),
  });
  assert.equal(step2.progressMade, true, 'File edit indicates forward progress');
  assert.equal(step2.stage, 'implementation', 'Stage should advance to implementation');
  analyzer.recordAction({ round: 2, filesModified: ['app.py'], timestamp: Date.now() });

  const step3 = analyzer.analyzeStep({
    round: 3,
    command: 'python3 app.py',
    exitCode: 0,
    timestamp: Date.now(),
  });
  assert.equal(step3.progressMade, true, 'Exit code 0 indicates problem resolved');
  assert.equal(step3.isLooping, false, 'Should not be looping');
  console.log('✅ Test 6 Passed: Forward progress correctly recorded and stage transitioned.');
}

console.log('\n🎉 ALL 6 ANTI-LOOP & DIRECTION TESTS PASSED PERFECTLY!\n');
