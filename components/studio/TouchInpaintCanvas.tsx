import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  PanResponder,
  GestureResponderEvent,
  Text,
  TouchableOpacity,
  Platform,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import {
  Paintbrush,
  RotateCcw,
  Download,
  Copy,
  FlaskConical,
  Eye,
  RefreshCw,
  UploadCloud,
  Check,
  Expand,
  Shrink,
  ZoomIn,
  ZoomOut,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '../../theme/colors';
import { AspectRatioType } from '../../types';
import { SparkGpuStats } from '../../stores/useStudioStore';
import { IMAGE_SIZE_MAP } from '../../services/kreaService';

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

interface TouchInpaintCanvasProps {
  imageUri: string | null;
  originalImageUri?: string | null;
  brushSize: number;
  isMaskEnabled: boolean;
  aspectRatio: AspectRatioType;
  onMaskChange?: (paths: string[]) => void;
  onClearMask?: () => void;
  onImageDrop?: (uri: string) => void;
  onCanvasLayout?: (size: { width: number; height: number }) => void;
  isFallback?: boolean;
  onDownloadImage?: () => void;
  onCopyImage?: () => void;
  onSendToSandbox?: () => void;
  onInpaintThis?: () => void;
  onRegenerate?: () => void;

  // Real-time processing HUD props
  isGenerating?: boolean;
  progress?: number;
  statusText?: string;
  stepText?: string;
  elapsedSec?: number;
  modelName?: string;
  gpuStats?: SparkGpuStats | null;
  isDesktop?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export const TouchInpaintCanvas: React.FC<TouchInpaintCanvasProps> = ({
  imageUri,
  originalImageUri,
  brushSize,
  isMaskEnabled,
  aspectRatio,
  onMaskChange,
  onClearMask,
  onImageDrop,
  onCanvasLayout,
  isFallback = false,
  onDownloadImage,
  onCopyImage,
  onSendToSandbox,
  onInpaintThis,
  onRegenerate,
  isGenerating = false,
  progress = 0,
  statusText = 'Synthesizing...',
  stepText = '',
  elapsedSec = 0,
  modelName = 'Krea 2 RAW',
  gpuStats = null,
  isDesktop = false,
  isExpanded = false,
  onToggleExpand,
}) => {
  const [paths, setPaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [isComparing, setIsComparing] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1.0);

  const pathsRef = useRef<string[]>([]);
  const currentPathRef = useRef('');
  const maskEnabledRef = useRef(isMaskEnabled);
  const generatingRef = useRef(isGenerating);
  const zoomRef = useRef(zoomLevel);
  const onMaskChangeRef = useRef(onMaskChange);

  useEffect(() => {
    pathsRef.current = paths;
  }, [paths]);
  useEffect(() => {
    maskEnabledRef.current = isMaskEnabled;
  }, [isMaskEnabled]);
  useEffect(() => {
    generatingRef.current = isGenerating;
  }, [isGenerating]);
  useEffect(() => {
    zoomRef.current = zoomLevel;
  }, [zoomLevel]);
  useEffect(() => {
    onMaskChangeRef.current = onMaskChange;
  }, [onMaskChange]);

  useEffect(() => {
    setPaths([]);
    pathsRef.current = [];
    setCurrentPath('');
    currentPathRef.current = '';
  }, [imageUri]);

  useEffect(() => {
    if (isMaskEnabled) setZoomLevel(1);
  }, [isMaskEnabled]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () =>
        maskEnabledRef.current && !generatingRef.current && zoomRef.current === 1,
      onMoveShouldSetPanResponder: () =>
        maskEnabledRef.current && !generatingRef.current && zoomRef.current === 1,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const { locationX, locationY } = evt.nativeEvent;
        const initialPath = 'M ' + Math.round(locationX) + ' ' + Math.round(locationY);
        currentPathRef.current = initialPath;
        setCurrentPath(initialPath);
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        const { locationX, locationY } = evt.nativeEvent;
        const next = currentPathRef.current + ' L ' + Math.round(locationX) + ' ' + Math.round(locationY);
        currentPathRef.current = next;
        setCurrentPath(next);
      },
      onPanResponderRelease: () => {
        const stroke = currentPathRef.current;
        if (stroke) {
          const nextPaths = [...pathsRef.current, stroke];
          pathsRef.current = nextPaths;
          setPaths(nextPaths);
          currentPathRef.current = '';
          setCurrentPath('');
          onMaskChangeRef.current?.(nextPaths);
        }
      },
    })
  ).current;

  const handleClear = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    setPaths([]);
    pathsRef.current = [];
    setCurrentPath('');
    currentPathRef.current = '';
    onClearMask?.();
    onMaskChange?.([]);
  };

  const handleUndo = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    const next = pathsRef.current.slice(0, -1);
    pathsRef.current = next;
    setPaths(next);
    onMaskChange?.(next);
  };

  const getAspectRatioStyle = () => {
    switch (aspectRatio) {
      case '9:16':
        return { aspectRatio: 9 / 16 };
      case '16:9':
        return { aspectRatio: 16 / 9 };
      case '4:5':
        return { aspectRatio: 4 / 5 };
      case '21:9':
        return { aspectRatio: 21 / 9 };
      case '1:1':
      default:
        return { aspectRatio: 1 };
    }
  };

  const getResolutionDisplay = () => {
    const size = IMAGE_SIZE_MAP[aspectRatio] || IMAGE_SIZE_MAP['1:1'];
    return size.width + ' × ' + size.height;
  };

  const displayProgress = Math.max(0, Math.min(100, progress));
  const activeDisplayUri = isComparing && originalImageUri ? originalImageUri : imageUri;

  // Web drag & drop and mouse movement handlers
  const webContainerProps = Platform.OS === 'web' ? {
    onDragOver: (e: any) => {
      e.preventDefault();
      setIsDraggingOver(true);
    },
    onDragLeave: (e: any) => {
      e.preventDefault();
      setIsDraggingOver(false);
    },
    onDrop: (e: any) => {
      e.preventDefault();
      setIsDraggingOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            onImageDrop?.(reader.result);
          }
        };
        reader.readAsDataURL(file);
      }
    },
    onWheel: (e: any) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          setZoomLevel((z) => Math.min(3.0, Number((z + 0.15).toFixed(2))));
        } else {
          setZoomLevel((z) => Math.max(0.75, Number((z - 0.15).toFixed(2))));
        }
      }
    },
    onMouseMove: (e: any) => {
      if (isMaskEnabled) {
        const rect = e.currentTarget?.getBoundingClientRect();
        if (rect) {
          setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }
      }
    },
    onMouseLeave: () => {
      setMousePos(null);
    },
  } : {};

  return (
    <View
      style={[
        styles.outerContainer,
        isDesktop && styles.outerContainerDesktop,
        isExpanded && styles.outerContainerExpanded,
        getAspectRatioStyle(),
        isDraggingOver && styles.dragOverActive,
      ]}
      {...webContainerProps}
    >
      <View
        style={styles.canvasArea}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (width > 0 && height > 0) onCanvasLayout?.({ width, height });
        }}
        {...panResponder.panHandlers}
      >
        {/* Top Floating Studio Header */}
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            <View style={styles.resBadge}>
              <Text style={styles.resBadgeText}>
                {getResolutionDisplay()} • RAW FP8
              </Text>
            </View>

            {/* Desktop Zoom Stepper */}
            {isDesktop && (
              <View style={styles.zoomPill}>
                <TouchableOpacity
                  style={styles.zoomBtn}
                  onPress={() => {
                    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch(e){}
                    setZoomLevel((z) => Math.max(0.75, Number((z - 0.25).toFixed(2))));
                  }}
                  activeOpacity={0.7}
                  disabled={isGenerating}
                >
                  <ZoomOut size={12} color="#A1A1AA" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.zoomLabelBtn}
                  onPress={() => {
                    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch(e){}
                    setZoomLevel(1.0);
                  }}
                  activeOpacity={0.7}
                  disabled={isGenerating}
                >
                  <Text style={styles.zoomLabelText}>{Math.round(zoomLevel * 100)}%</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.zoomBtn}
                  onPress={() => {
                    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch(e){}
                    setZoomLevel((z) => Math.min(3.0, Number((z + 0.25).toFixed(2))));
                  }}
                  activeOpacity={0.7}
                  disabled={isGenerating}
                >
                  <ZoomIn size={12} color="#A1A1AA" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.topBarRight}>
            {originalImageUri && imageUri && originalImageUri !== imageUri && (
              <TouchableOpacity
                style={[styles.compareBtn, isComparing && styles.compareBtnActive]}
                onPressIn={() => setIsComparing(true)}
                onPressOut={() => setIsComparing(false)}
                activeOpacity={0.8}
              >
                <Eye size={13} color={isComparing ? '#09090B' : Colors.brand.emerald} />
                <Text style={[styles.compareText, isComparing && styles.compareTextActive]}>
                  {isComparing ? 'Showing Original' : 'Hold to Compare'}
                </Text>
              </TouchableOpacity>
            )}

            {isFallback && !isGenerating && (
              <View style={styles.fallbackBadge}>
                <Text style={styles.fallbackBadgeText}>BRIDGE FAILED</Text>
              </View>
            )}

            {isMaskEnabled && !isGenerating && (
              <View style={styles.maskActiveBadge}>
                <View style={styles.maskDot} />
                <Text style={styles.maskBadgeText}>INPAINT ACTIVE</Text>
              </View>
            )}

            {/* Expand / Shrink Stage Toggle Button */}
            {onToggleExpand && isDesktop && (
              <TouchableOpacity
                style={[styles.expandBtn, isExpanded && styles.expandBtnActive]}
                onPress={() => {
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch(e){}
                  onToggleExpand();
                }}
                activeOpacity={0.75}
              >
                {isExpanded ? (
                  <>
                    <Shrink size={12} color="#09090B" />
                    <Text style={styles.expandBtnTextActive}>Standard</Text>
                  </>
                ) : (
                  <>
                    <Expand size={12} color={Colors.brand.emerald} />
                    <Text style={styles.expandBtnText}>Expand</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Base Image with Zoom Transform */}
        {activeDisplayUri ? (
          <View style={[styles.imageZoomWrapper, { transform: [{ scale: zoomLevel }] }]}>
            <Image
              source={{ uri: activeDisplayUri }}
              style={styles.baseImage}
              resizeMode="contain"
              onError={(e) => console.warn('[TouchInpaintCanvas] Image render error:', e.nativeEvent)}
            />
          </View>
        ) : (
          <View style={styles.placeholder}>
            <View style={styles.placeholderIconWrap}>
              <UploadCloud size={36} color={Colors.brand.emerald} />
            </View>
            <Text style={styles.placeholderTitle}>Neural Studio Canvas</Text>
            <Text style={styles.placeholderSub}>
              {isDesktop
                ? 'Enter a vision prompt, drag & drop an image, or select a preset to synthesize'
                : 'Enter a vision prompt or select a photo to begin inpainting'}
            </Text>
          </View>
        )}

        {/* Drag & Drop Web Overlay */}
        {isDraggingOver && (
          <View style={styles.dropOverlay}>
            <UploadCloud size={48} color={Colors.brand.emerald} />
            <Text style={styles.dropOverlayText}>Drop Image to Load into Canvas</Text>
          </View>
        )}

        {/* SVG Inpaint Mask Overlay */}
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          {paths.map((p, idx) => (
            <Path
              key={idx}
              d={p}
              stroke="rgba(244, 63, 94, 0.45)"
              strokeWidth={brushSize}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
          {currentPath ? (
            <Path
              d={currentPath}
              stroke="rgba(244, 63, 94, 0.45)"
              strokeWidth={brushSize}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ) : null}

          {/* Mouse Hover Brush Circle on Web */}
          {Platform.OS === 'web' && isMaskEnabled && mousePos && !isGenerating && (
            <Circle
              cx={mousePos.x}
              cy={mousePos.y}
              r={brushSize / 2}
              stroke="rgba(244, 63, 94, 0.9)"
              strokeWidth="2"
              fill="rgba(244, 63, 94, 0.2)"
            />
          )}
        </Svg>

        {/* Clear & Undo Floating Actions */}
        {paths.length > 0 && !isGenerating && (
          <View style={styles.floatingControls}>
            <TouchableOpacity
              style={styles.floatingBtn}
              onPress={handleUndo}
              activeOpacity={0.7}
            >
              <RotateCcw size={13} color={Colors.text.secondary} />
              <Text style={styles.floatingBtnText}>Undo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.floatingBtn, styles.clearBtn]}
              onPress={handleClear}
              activeOpacity={0.7}
            >
              <Text style={[styles.floatingBtnText, { color: Colors.brand.rose }]}>
                Clear ({paths.length})
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom Quick Action Strip on Generated Image */}
        {imageUri && !isGenerating && (
          <View style={styles.actionStrip}>
            {onDownloadImage && (
              <TouchableOpacity
                style={styles.stripBtn}
                onPress={onDownloadImage}
                activeOpacity={0.75}
              >
                <Download size={14} color="#E4E4E7" />
                <Text style={styles.stripBtnText}>Save RAW</Text>
              </TouchableOpacity>
            )}

            {onCopyImage && (
              <TouchableOpacity
                style={styles.stripBtn}
                onPress={onCopyImage}
                activeOpacity={0.75}
              >
                <Copy size={14} color="#E4E4E7" />
                <Text style={styles.stripBtnText}>Copy</Text>
              </TouchableOpacity>
            )}

            {onSendToSandbox && (
              <TouchableOpacity
                style={[styles.stripBtn, styles.stripBtnSandbox]}
                onPress={onSendToSandbox}
                activeOpacity={0.75}
              >
                <FlaskConical size={14} color={Colors.brand.emerald} />
                <Text style={[styles.stripBtnText, { color: Colors.brand.emerald }]}>
                  Send to Sandbox
                </Text>
              </TouchableOpacity>
            )}

            {onInpaintThis && (
              <TouchableOpacity
                style={styles.stripBtn}
                onPress={onInpaintThis}
                activeOpacity={0.75}
              >
                <Paintbrush size={14} color="#E4E4E7" />
                <Text style={styles.stripBtnText}>Inpaint This</Text>
              </TouchableOpacity>
            )}

            {onRegenerate && (
              <TouchableOpacity
                style={styles.stripBtn}
                onPress={onRegenerate}
                activeOpacity={0.75}
              >
                <RefreshCw size={13} color="#E4E4E7" />
                <Text style={styles.stripBtnText}>Variation</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* REAL-TIME GENERATION PROCESSING HUD OVERLAY */}
        {isGenerating && (
          <View style={styles.hudOverlay}>
            {/* Top Row: Status Badge & GPU Gauges */}
            <View style={styles.hudTopRow}>
              <View style={styles.hudStatusBadge}>
                <View style={styles.hudPulseDot} />
                <Text style={styles.hudStatusText}>{statusText.toUpperCase()}</Text>
              </View>

              {gpuStats && (
                <View style={styles.hudGpuBadge}>
                  <Text style={styles.hudGpuText}>
                    {'GB10 • ' + (gpuStats.tempC ? gpuStats.tempC + '°C' : 'ACTIVE') + ' • ' + gpuStats.gpuUtilPct + '% GPU • ' + gpuStats.powerDrawW + 'W'}
                  </Text>
                </View>
              )}
            </View>

            {/* Center: Large Glowing Percentage & Step Counter */}
            <View style={styles.hudCenter}>
              <Text style={styles.hudPercentage}>{Math.round(displayProgress) + '%'}</Text>
              <Text style={styles.hudStep}>{stepText || 'Diffusing Latents...'}</Text>

              {/* Glowing High-Tech Progress Track */}
              <View style={styles.hudTrack}>
                <View style={[styles.hudFill, { width: Math.max(5, displayProgress) + '%' }]} />
              </View>
            </View>

            {/* Bottom Row: Active Model Tag & Elapsed Time */}
            <View style={styles.hudBottomRow}>
              <View style={styles.hudModelTag}>
                <Text style={styles.hudModelLabel}>ENGINE</Text>
                <Text style={styles.hudModelValue}>{modelName}</Text>
              </View>
              <View style={styles.hudTimerTag}>
                <Text style={styles.hudTimerLabel}>TIME</Text>
                <Text style={styles.hudTimerValue}>{'⏱ ' + formatElapsed(elapsedSec)}</Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    width: '100%',
    maxHeight: 520,
    backgroundColor: '#09090D',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  outerContainerDesktop: {
    maxHeight: 840,
    minHeight: 580,
    height: '100%',
    maxWidth: 1100,
  },
  outerContainerExpanded: {
    maxHeight: '92vh' as any,
    minHeight: 680,
    maxWidth: '100%',
    borderRadius: 14,
  },
  dragOverActive: {
    borderColor: Colors.brand.emerald,
    borderStyle: 'dashed',
  },
  canvasArea: {
    flex: 1,
    width: '100%',
    minHeight: 280,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#070709',
    overflow: 'hidden',
  },
  imageZoomWrapper: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 20,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resBadge: {
    backgroundColor: 'rgba(12, 13, 18, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  resBadgeText: {
    fontSize: 11,
    fontFamily: 'Menlo',
    color: '#A1A1AA',
    fontWeight: '700',
  },
  zoomPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(12, 13, 18, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  zoomBtn: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  zoomLabelBtn: {
    paddingHorizontal: 7,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  zoomLabelText: {
    fontSize: 10.5,
    fontFamily: 'Menlo',
    fontWeight: '700',
    color: '#D4D4D8',
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(12, 13, 18, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  expandBtnActive: {
    backgroundColor: Colors.brand.emerald,
    borderColor: Colors.brand.emerald,
  },
  expandBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.brand.emerald,
  },
  expandBtnTextActive: {
    fontSize: 11,
    fontWeight: '700',
    color: '#09090B',
  },
  compareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(12, 13, 18, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  compareBtnActive: {
    backgroundColor: Colors.brand.emerald,
    borderColor: Colors.brand.emerald,
  },
  compareText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.brand.emerald,
  },
  compareTextActive: {
    color: '#09090B',
  },
  baseImage: {
    width: '100%',
    height: '100%',
    minHeight: 280,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  placeholderIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F4F4F5',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  placeholderSub: {
    fontSize: 13,
    color: '#71717A',
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 19,
  },
  dropOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9, 9, 11, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    zIndex: 30,
  },
  dropOverlayText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.brand.emerald,
  },
  maskActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(244, 63, 94, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.4)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  maskDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.brand.rose,
  },
  maskBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.brand.rose,
    letterSpacing: 0.5,
  },
  fallbackBadge: {
    backgroundColor: 'rgba(244, 63, 94, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.45)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  fallbackBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.brand.rose,
    letterSpacing: 0.5,
  },
  floatingControls: {
    position: 'absolute',
    top: 54,
    right: 12,
    flexDirection: 'row',
    gap: 6,
    zIndex: 16,
  },
  floatingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(18, 18, 22, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  clearBtn: {
    borderColor: 'rgba(244, 63, 94, 0.3)',
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
  },
  floatingBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#D4D4D8',
  },
  actionStrip: {
    position: 'absolute',
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(12, 13, 18, 0.92)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    zIndex: 18,
    flexWrap: 'wrap',
    justifyContent: 'center',
    maxWidth: '92%',
  },
  stripBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  stripBtnSandbox: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  stripBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E4E4E7',
  },

  // HUD STYLES
  hudOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9, 9, 11, 0.92)',
    justifyContent: 'space-between',
    padding: 20,
    zIndex: 25,
  },
  hudTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  hudStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.35)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
  },
  hudPulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
  },
  hudStatusText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#3B82F6',
    letterSpacing: 0.8,
  },
  hudGpuBadge: {
    backgroundColor: 'rgba(24, 24, 27, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  hudGpuText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#A1A1AA',
    fontWeight: '600',
  },
  hudCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  hudPercentage: {
    fontSize: 64,
    fontWeight: '900',
    color: '#F4F4F5',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: -1,
  },
  hudStep: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 18,
    letterSpacing: 0.4,
  },
  hudTrack: {
    width: '100%',
    maxWidth: 320,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  hudFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 3,
  },
  hudBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 12,
  },
  hudModelTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hudModelLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#71717A',
    letterSpacing: 0.6,
  },
  hudModelValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#E4E4E7',
  },
  hudTimerTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hudTimerLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#71717A',
    letterSpacing: 0.6,
  },
  hudTimerValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#3B82F6',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
