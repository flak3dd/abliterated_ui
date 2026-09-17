#!/usr/bin/env node
/**
 * ==============================================================================
 * SPARK AUTONOMOUS CODING AGENT — Powered by qwen-abliterated on DGX Spark
 * ==============================================================================
 * Enables qwen-abliterated to execute real terminal commands, inspect codebases,
 * run tests, and autonomously problem-solve in a multi-step agentic loop.
 * ==============================================================================
 */

import readline from 'node:readline';
import http from 'node:http';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execP = promisify(exec);

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  brightGreen: '\x1b[92m',
  brightCyan: '\x1b[96m',
  brightYellow: '\x1b[93m',
};

const SYSTEM_PROMPT = `You are an elite, uncensored autonomous AI software engineer and systems copilot running on NVIDIA DGX Spark GB10.
You operate with native terminal execution and ephemeral sandbox test environments.

CRITICAL CODE EXECUTION & FILE NAMING RULES:
1. File Headers: ALWAYS specify exact relative filepaths in code block headers (e.g. \`\`\`python src/tool.py or \`\`\`python tests/test_tool.py).
2. Test Readiness: Whenever you write code, provide both the implementation and its automated test suite (pytest for Python, vitest for TypeScript). Relative imports must resolve cleanly from the project root.
3. Zero Stubs: Never leave "...", incomplete functions, or TODO placeholders. Ensure 100% runnable code on first pass.
4. Autonomous Verification: To execute a shell command to verify files or run tests, output:
<run>command</run> or \`\`\`bash\n$ command\n\`\`\`
The user's terminal will execute the command and feed stdout/stderr back to you to analyze and iterate.`;

class SparkAgent {
  constructor() {
    this.hosts = ['100.94.45.77', '192.168.4.101', '127.0.0.1'];
    this.activeHost = '100.94.45.77';
    this.port = 8000;
    this.model = 'qwen-abliterated';
    this.conversation = [];
    this.autoExec = false;
    this.maxAgentLoops = 8;
    this.isStreaming = false;
  }

  async probeHost() {
    for (const h of this.hosts) {
      const ok = await new Promise((resolve) => {
        const req = http.get(`http://${h}:${this.port}/v1/models`, { timeout: 1200 }, (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
      });
      if (ok) {
        this.activeHost = h;
        return h;
      }
    }
    return this.activeHost;
  }

  async execLocal(cmd, cwd = process.cwd(), timeoutMs = 60000) {
    try {
      const { stdout, stderr } = await execP(cmd, {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        shell: process.platform === 'win32' ? undefined : '/bin/bash',
      });
      return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (err) {
      return {
        ok: false,
        stdout: (err.stdout || '').trim(),
        stderr: (err.stderr || err.message).trim(),
      };
    }
  }

  extractCommands(text) {
    const commands = [];

    // 1. Match <run>cmd</run> or <bash>cmd</bash> or <cmd>cmd</cmd>
    const tagRegex = /<(run|bash|cmd)>([\s\S]*?)<\/\1>/gi;
    let match;
    while ((match = tagRegex.exec(text)) !== null) {
      const cmd = (match[2] || '').trim();
      if (cmd && !commands.includes(cmd)) commands.push(cmd);
    }

    // 2. Match markdown blocks: ```bash\n$ cmd\n```
    const mdRegex = /```(?:bash|sh|zsh)\s*\n(?:\$\s*)([^\n]+(?:\n(?:\s*&&|\\\n|\s*\|)[^\n]+)*)\n```/gi;
    while ((match = mdRegex.exec(text)) !== null) {
      const cmd = (match[1] || '').trim();
      if (cmd && !commands.includes(cmd)) commands.push(cmd);
    }

    return commands;
  }

  async streamCompletion(prompt, rl) {
    if (prompt) {
      this.conversation.push({ role: 'user', content: prompt });
    }

    const payload = JSON.stringify({
      model: this.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...this.conversation,
      ],
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
      // Flash-Next: without enable_thinking:false, content is null and reasoning is filled
      chat_template_kwargs: { enable_thinking: false },
    });

    return new Promise((resolve) => {
      const req = http.request(
        `http://${this.activeHost}:${this.port}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (res) => {
          if (res.statusCode !== 200) {
            console.log(`${C.red}HTTP ${res.statusCode} from vLLM${C.reset}`);
            return resolve('');
          }

          let fullResponse = '';
          let inThink = false;
          let buffer = '';
          let tokenCount = 0;
          const t0 = Date.now();

          process.stdout.write(`\n${C.brightCyan}${C.bold}${this.model}:${C.reset} `);

          res.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const jsonStr = trimmed.slice(5).trim();
              if (jsonStr === '[DONE]') continue;

              try {
                const parsed = JSON.parse(jsonStr);
                const delta = parsed.choices?.[0]?.delta?.content || '';
                if (!delta) continue;

                tokenCount++;

                if (delta.includes('<think>')) {
                  inThink = true;
                  process.stdout.write(`\n${C.dim}${C.magenta}[Reasoning Trace]${C.reset} `);
                  const clean = delta.replace('<think>', '');
                  if (clean) process.stdout.write(`${C.dim}${clean}${C.reset}`);
                  fullResponse += delta;
                  continue;
                }

                if (delta.includes('</think>')) {
                  inThink = false;
                  const clean = delta.replace('</think>', '');
                  if (clean) process.stdout.write(`${C.dim}${clean}${C.reset}`);
                  process.stdout.write(`\n\n${C.reset}`);
                  fullResponse += delta;
                  continue;
                }

                if (inThink) {
                  process.stdout.write(`${C.dim}${delta}${C.reset}`);
                } else {
                  process.stdout.write(delta);
                }
                fullResponse += delta;
              } catch {}
            }
          });

          res.on('end', async () => {
            const elapsed = Math.max(0.1, (Date.now() - t0) / 1000);
            const tps = (tokenCount / elapsed).toFixed(1);
            console.log(`\n${C.dim}───────────────────────────────────────────────────────────────────────────────${C.reset}`);
            console.log(`${C.dim}⚡ ${C.bold}${tokenCount}${C.reset}${C.dim} tokens · ${C.cyan}${elapsed.toFixed(2)}s${C.reset}${C.dim} · ${C.green}${C.bold}${tps} t/s${C.reset}\n`);

            this.conversation.push({ role: 'assistant', content: fullResponse });
            resolve(fullResponse);
          });

          res.on('error', (err) => {
            console.log(`\n${C.red}Stream Error: ${err.message}${C.reset}\n`);
            resolve(fullResponse);
          });
        }
      );

      req.on('error', (err) => {
        console.log(`\n${C.red}Connection Error: ${err.message}${C.reset}\n`);
        resolve('');
      });

      req.write(payload);
      req.end();
    });
  }

  async runAgenticLoop(initialPrompt, rl) {
    let currentPrompt = initialPrompt;
    let loopCount = 0;

    while (loopCount < this.maxAgentLoops) {
      loopCount++;
      const response = await this.streamCompletion(currentPrompt, rl);
      currentPrompt = null; // Only send user prompt on first iteration

      const proposedCommands = this.extractCommands(response);
      if (proposedCommands.length === 0) {
        break; // No further commands requested, turn finished
      }

      for (let cmd of proposedCommands) {
        console.log(`\n${C.bold}${C.brightCyan}⚡ COMMAND EXECUTION REQUESTED BY ${this.model}:${C.reset}`);
        console.log(`${C.dim}┌─────────────────────────────────────────────────────────────────────────────┐${C.reset}`);
        console.log(`${C.dim}│${C.reset} ${C.bold}Command:${C.reset} ${C.brightGreen}$ ${cmd}${C.reset}`);
        console.log(`${C.dim}│${C.reset} ${C.bold}Working Directory:${C.reset} ${process.cwd()}`);
        console.log(`${C.dim}└─────────────────────────────────────────────────────────────────────────────┘${C.reset}`);

        let shouldExecute = this.autoExec;

        if (!shouldExecute) {
          const answer = await new Promise((res) => {
            rl.question(`${C.bold}Execute this command? [Y/n/edit/all]: ${C.reset}`, (ans) => {
              res((ans || 'y').trim().toLowerCase());
            });
          });

          if (answer === 'n' || answer === 'no') {
            console.log(`${C.yellow}○ Command execution skipped.${C.reset}\n`);
            this.conversation.push({
              role: 'user',
              content: `[User skipped execution of command: \`${cmd}\`]. Continue without running it.`,
            });
            continue;
          }

          if (answer === 'all' || answer === 'a') {
            this.autoExec = true;
            shouldExecute = true;
          } else if (answer === 'edit' || answer === 'e') {
            cmd = await new Promise((res) => {
              rl.question(`${C.cyan}Edit command:${C.reset} `, (edited) => {
                res(edited.trim());
              });
            });
            shouldExecute = true;
          } else {
            shouldExecute = true;
          }
        }

        if (shouldExecute) {
          console.log(`\n${C.cyan}▶ Executing: ${C.bold}${cmd}${C.reset}...`);
          const tStart = Date.now();
          const result = await this.execLocal(cmd);
          const elapsed = ((Date.now() - tStart) / 1000).toFixed(2);
          const rawOutput = (result.stdout ? result.stdout : '') + (result.stderr ? (result.stdout ? '\n' : '') + result.stderr : '');
          const output = rawOutput.trim() || '(Command finished with exit code 0 and no output)';

          console.log(`\n${result.ok ? C.green + '✔ Output' : C.red + '❌ Error'} ${C.dim}(${elapsed}s):${C.reset}`);
          console.log(`${C.dim}───────────────────────────────────────────────────────────────────────────────${C.reset}`);
          console.log(output.length > 2500 ? output.slice(0, 2500) + `\n${C.dim}... (truncated ${output.length - 2500} bytes)${C.reset}` : output);
          console.log(`${C.dim}───────────────────────────────────────────────────────────────────────────────${C.reset}\n`);

          // Append output to conversation so model receives tool feedback
          this.conversation.push({
            role: 'user',
            content: `[Command Result for: \`${cmd}\`]:\n\`\`\`\n${output}\n\`\`\`\nAnalyze this result and proceed.`,
          });
        }
      }

      console.log(`${C.cyan}↳ Autonomous reasoning next step...${C.reset}`);
    }
  }

  async start() {
    console.clear();
    console.log(`${C.bold}======================================================================${C.reset}`);
    console.log(`   ${C.brightGreen}⚡ SPARK AUTONOMOUS CODING AGENT (qwen-abliterated)${C.reset}`);
    console.log(`${C.bold}======================================================================${C.reset}`);

    process.stdout.write(`Probing DGX Spark backend... `);
    const host = await this.probeHost();
    console.log(`${C.green}✔ Connected to ${host}:${this.port}${C.reset}`);
    console.log(`${C.dim}Model: ${this.model} • Agent Mode: Autonomous Command Execution${C.reset}`);
    console.log(`${C.dim}Commands: !<cmd> to run shell • .auto on/off • .clear • .exit${C.reset}\n`);

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const promptUser = () => {
      rl.question(`\n${C.brightGreen}[${this.model}]${C.reset} ${C.dim}${this.autoExec ? '⚡AUTO' : '🛡SAFE'}❯${C.reset} `, async (line) => {
        const input = (line || '').trim();
        if (!input) return promptUser();

        const lower = input.toLowerCase();

        if (lower === 'exit' || lower === 'quit' || lower === '.exit' || lower === '/exit') {
          console.log(`\n${C.cyan}Exiting Spark Agent. Goodbye!${C.reset}\n`);
          rl.close();
          process.exit(0);
        }

        if (lower === 'clear' || lower === '.clear' || lower === '/clear') {
          this.conversation = [];
          console.log(`\n${C.green}✔ Conversation context cleared.${C.reset}\n`);
          return promptUser();
        }

        if (lower === '.auto on' || lower === '/auto on' || lower === '.auto 1') {
          this.autoExec = true;
          console.log(`\n${C.yellow}⚡ Auto-execution mode ENABLED (commands run without confirmation).${C.reset}\n`);
          return promptUser();
        }

        if (lower === '.auto off' || lower === '/auto off' || lower === '.auto 0') {
          this.autoExec = false;
          console.log(`\n${C.green}🛡 Safe mode ENABLED (confirmation requested before running commands).${C.reset}\n`);
          return promptUser();
        }

        if (lower === 'help' || lower === '.help' || lower === '/help') {
          console.log(`\n${C.bold}Spark Agent Help:${C.reset}`);
          console.log(`  Ask ${this.model} to inspect files, edit code, or run build tools.`);
          console.log(`  ${C.cyan}!<command>${C.reset}     Run a local shell command directly (e.g. !ls, !git status)`);
          console.log(`  ${C.cyan}.auto on/off${C.reset}  Toggle automatic execution of model commands`);
          console.log(`  ${C.cyan}.clear${C.reset}        Reset conversation context`);
          console.log(`  ${C.cyan}.exit${C.reset}         Exit the agent\n`);
          return promptUser();
        }

        // Direct shell command prefix: !<cmd>
        if (input.startsWith('!')) {
          const rawCmd = input.slice(1).trim();
          if (rawCmd) {
            console.log(`\n${C.cyan}▶ Executing local command: ${C.bold}${rawCmd}${C.reset}...`);
            const res = await this.execLocal(rawCmd);
            const out = (res.stdout ? res.stdout : '') + (res.stderr ? (res.stdout ? '\n' : '') + res.stderr : '');
            console.log(`\n${res.ok ? C.green + '✔ Output' : C.red + '❌ Error'}:`);
            console.log(`${C.dim}───────────────────────────────────────────────────────────────────────────────${C.reset}`);
            console.log(out || '(No output)');
            console.log(`${C.dim}───────────────────────────────────────────────────────────────────────────────${C.reset}\n`);

            rl.question(`${C.bold}Feed this output to ${this.model}? [y/N]: ${C.reset}`, async (feedAns) => {
              if ((feedAns || '').trim().toLowerCase() === 'y') {
                await this.runAgenticLoop(`Here is the output of running \`${rawCmd}\`:\n\`\`\`\n${out}\n\`\`\`\nPlease analyze it.`, rl);
              }
              promptUser();
            });
            return;
          }
        }

        // Run agentic loop with qwen-abliterated
        try {
          await this.runAgenticLoop(input, rl);
        } catch (err) {
          console.log(`\n${C.red}Agent Error: ${err.message}${C.reset}\n`);
        }

        promptUser();
      });
    };

    promptUser();
  }
}

const agent = new SparkAgent();
agent.start().catch((err) => {
  console.error('Fatal agent error:', err);
});
