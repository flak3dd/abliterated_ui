import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import {
  Cpu,
  FlaskConical,
  Hammer,
  ShieldCheck,
  Check,
  AlertTriangle,
  RotateCcw,
  Terminal,
  FileCode,
  Layers,
  ChevronRight,
  Zap,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { SwarmSession, SwarmSubtask, AgentRole } from '../../types';
import { useSwarmStore } from '../../stores/useSwarmStore';
import { useSandboxStore } from '../../stores/useSandboxStore';
import { ReasoningAccordion } from './ReasoningAccordion';

interface SwarmInspectorCardProps {
  swarm: SwarmSession;
}

function getRoleIcon(role: AgentRole) {
  switch (role) {
    case 'orchestrator':
      return <Layers size={13} color={Colors.brand.emerald} />;
    case 'tester':
      return <FlaskConical size={13} color={Colors.brand.sky} />;
    case 'critic':
      return <ShieldCheck size={13} color="#F59E0B" />;
    case 'worker':
    default:
      return <Hammer size={13} color={Colors.brand.emerald} />;
  }
}

export const SwarmInspectorCard: React.FC<SwarmInspectorCardProps> = ({ swarm }) => {
  const { selectedTaskId, setSelectedTaskId, workerOutputs, retrySubtask } = useSwarmStore();
  const { runTestsForEnv, setDrawerOpen } = useSandboxStore();

  const activeTask = swarm.tasks.find((t) => t.id === selectedTaskId) || swarm.tasks[0];
  const activeStream = activeTask ? workerOutputs[activeTask.id] : null;

  const completedCount = swarm.tasks.filter((t) => t.status === 'completed').length;
  const isRunning = swarm.status === 'running' || swarm.status === 'planning';

  return (
    <View style={styles.container}>
      {/* Top Swarm Header Banner */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.swarmIconBadge}>
            <Zap size={13} color={Colors.brand.emerald} />
          </View>
          <View>
            <View style={styles.titleRow}>
              <Text style={styles.title}>MULTI-AGENT SWARM MATRIX</Text>
              <View style={[styles.statusBadge, isRunning ? styles.statusBadgeRunning : styles.statusBadgeDone]}>
                {isRunning ? (
                  <>
                    <ActivityIndicator size="small" color={Colors.brand.emerald} style={{ transform: [{ scale: 0.6 }] }} />
                    <Text style={styles.statusBadgeTextRunning}>
                      {swarm.activeWorkerCount > 0 ? `${swarm.activeWorkerCount} Agents Active` : 'Decomposing...'}
                    </Text>
                  </>
                ) : (
                  <>
                    <Check size={10} color={Colors.brand.emerald} />
                    <Text style={styles.statusBadgeTextDone}>All Agents Completed</Text>
                  </>
                )}
              </View>
            </View>
            <Text style={styles.masterGoal} numberOfLines={1}>
              {swarm.masterGoal}
            </Text>
            {swarm.dispatchReason ? (
              <Text style={styles.dispatchReasonText} numberOfLines={1}>
                ⚡ Agent Decision: {swarm.dispatchReason}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.progressCol}>
          <Text style={styles.progressText}>
            {completedCount}/{swarm.tasks.length} Completed • {swarm.overallProgress}%
          </Text>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${Math.max(5, swarm.overallProgress)}%` }]} />
          </View>
        </View>
      </View>

      {/* Interactive Subtask Worker Pipeline Cards */}
      <View style={styles.pipelineSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pipelineRow}>
          {swarm.tasks.map((task, idx) => {
            const isSelected = activeTask?.id === task.id;
            const taskStream = workerOutputs[task.id];

            return (
              <TouchableOpacity
                key={task.id}
                style={[
                  styles.workerCard,
                  isSelected && styles.workerCardSelected,
                  task.status === 'generating' && styles.workerCardGenerating,
                ]}
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (e) {}
                  setSelectedTaskId(task.id);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.workerCardTop}>
                  <View style={styles.workerRoleBadge}>
                    {getRoleIcon(task.role)}
                    <Text style={styles.workerRoleText}>{task.role.toUpperCase()}</Text>
                  </View>

                  {task.status === 'generating' ? (
                    <View style={styles.workerLivePulse}>
                      <View style={styles.pulseDot} />
                      <Text style={styles.tokRateText}>
                        {taskStream?.tokensPerSec ? `${taskStream.tokensPerSec} t/s` : 'Active'}
                      </Text>
                    </View>
                  ) : task.status === 'completed' ? (
                    <View style={styles.workerDoneBadge}>
                      <Check size={10} color={Colors.brand.emerald} />
                    </View>
                  ) : task.status === 'failed' ? (
                    <TouchableOpacity
                      style={styles.workerRetryBtn}
                      onPress={() => retrySubtask(task.id)}
                    >
                      <RotateCcw size={10} color="#F43F5E" />
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.workerQueuedText}>Queued</Text>
                  )}
                </View>

                <Text style={styles.workerTitle} numberOfLines={1}>
                  {task.title}
                </Text>

                <View style={styles.workerFilesRow}>
                  <FileCode size={10} color="#71717A" />
                  <Text style={styles.workerFilesText} numberOfLines={1}>
                    {task.targetFiles.join(', ')}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Focused Worker Details & Reasoning Drawer */}
      {activeTask && (
        <View style={styles.focusedDetails}>
          <View style={styles.focusedHeader}>
            <View style={styles.focusedTitleRow}>
              <Text style={styles.focusedTaskTitle}>
                {activeTask.title}
              </Text>
              <Text style={styles.focusedFilesText}>
                → {activeTask.targetFiles.join(', ')}
              </Text>
            </View>

            {activeTask.groundingScore !== undefined && (
              <View style={styles.groundingPill}>
                <ShieldCheck size={10} color={Colors.brand.emerald} />
                <Text style={styles.groundingPillText}>
                  {activeTask.groundingScore}% Grounded
                </Text>
              </View>
            )}
          </View>

          {/* Reasoning trace if available */}
          {(activeTask.reasoning || activeStream?.reasoning) ? (
            <ReasoningAccordion
              reasoning={activeTask.reasoning || activeStream?.reasoning || ''}
              isStreaming={activeTask.status === 'generating'}
            />
          ) : null}

          {/* Streaming code snippet preview */}
          {activeStream?.content ? (
            <View style={styles.streamPreviewBox}>
              <Text style={styles.streamPreviewText} numberOfLines={6}>
                {activeStream.content.slice(-400)}
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Swarm Sandbox Quick Action Deck */}
      <View style={styles.actionBar}>
        <View style={styles.actionLeft}>
          <Terminal size={12} color={Colors.brand.emerald} />
          <Text style={styles.actionLeftText}>
            {swarm.totalFilesGenerated} Files Generated into Sandbox
          </Text>
        </View>

        <View style={styles.actionBtnsRow}>
          <TouchableOpacity
            style={styles.actionPillBtn}
            onPress={() => runTestsForEnv()}
            activeOpacity={0.7}
          >
            <FlaskConical size={11} color={Colors.brand.sky} />
            <Text style={styles.actionPillText}>Run Test Suite</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionPillBtn}
            onPress={() => setDrawerOpen(true)}
            activeOpacity={0.7}
          >
            <Terminal size={11} color={Colors.text.tertiary} />
            <Text style={styles.actionPillText}>Terminal</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(12, 13, 18, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  header: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 220,
  },
  swarmIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 11,
    fontFamily: 'Menlo',
    fontWeight: '800',
    color: Colors.brand.emerald,
    letterSpacing: 0.6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  statusBadgeRunning: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  statusBadgeDone: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  statusBadgeTextRunning: {
    fontSize: 9.5,
    fontFamily: 'Menlo',
    color: Colors.brand.emerald,
    fontWeight: '700',
  },
  statusBadgeTextDone: {
    fontSize: 9.5,
    fontFamily: 'Menlo',
    color: Colors.brand.emerald,
    fontWeight: '700',
  },
  masterGoal: {
    fontSize: 11.5,
    color: '#A1A1AA',
    maxWidth: 340,
    marginTop: 2,
  },
  dispatchReasonText: {
    fontSize: 9.5,
    fontFamily: 'Menlo',
    color: Colors.brand.emerald,
    maxWidth: 380,
    marginTop: 2,
    opacity: 0.9,
  },
  progressCol: {
    minWidth: 140,
    gap: 4,
  },
  progressText: {
    fontSize: 10,
    fontFamily: 'Menlo',
    color: '#A1A1AA',
    textAlign: 'right',
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.brand.emerald,
    borderRadius: 2,
  },
  pipelineSection: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  pipelineRow: {
    paddingHorizontal: 12,
    gap: 8,
  },
  workerCard: {
    width: 175,
    backgroundColor: 'rgba(20, 20, 26, 0.7)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 10,
    gap: 6,
  },
  workerCardSelected: {
    borderColor: Colors.brand.emerald,
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
  },
  workerCardGenerating: {
    borderColor: 'rgba(16, 185, 129, 0.5)',
  },
  workerCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  workerRoleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  workerRoleText: {
    fontSize: 9,
    fontFamily: 'Menlo',
    fontWeight: '800',
    color: '#A1A1AA',
  },
  workerLivePulse: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.brand.emerald,
  },
  tokRateText: {
    fontSize: 9,
    fontFamily: 'Menlo',
    color: Colors.brand.emerald,
  },
  workerDoneBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  workerRetryBtn: {
    padding: 2,
  },
  workerQueuedText: {
    fontSize: 9,
    color: '#71717A',
    fontFamily: 'Menlo',
  },
  workerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F4F4F5',
  },
  workerFilesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  workerFilesText: {
    fontSize: 10,
    fontFamily: 'Menlo',
    color: '#71717A',
  },
  focusedDetails: {
    padding: 12,
    backgroundColor: 'rgba(10, 10, 14, 0.6)',
    gap: 8,
  },
  focusedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  focusedTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  focusedTaskTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F4F4F5',
  },
  focusedFilesText: {
    fontSize: 10.5,
    fontFamily: 'Menlo',
    color: Colors.brand.emerald,
  },
  groundingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  groundingPillText: {
    fontSize: 9.5,
    fontFamily: 'Menlo',
    color: Colors.brand.emerald,
    fontWeight: '700',
  },
  streamPreviewBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  streamPreviewText: {
    fontSize: 10.5,
    fontFamily: 'Menlo',
    color: '#A1A1AA',
    lineHeight: 15,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(16, 17, 22, 0.8)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionLeftText: {
    fontSize: 11,
    color: '#A1A1AA',
    fontWeight: '500',
  },
  actionBtnsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  actionPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  actionPillText: {
    fontSize: 10.5,
    color: '#E4E4E7',
    fontWeight: '600',
  },
});
