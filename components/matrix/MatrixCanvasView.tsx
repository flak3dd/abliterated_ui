import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { MatrixRenderer } from '../../services/matrix/MatrixRenderer';
import { useMatrixStore } from '../../stores/useMatrixStore';

interface MatrixCanvasViewProps {
  style?: any;
  variant?: 'ambient' | 'director';
}

export const MatrixCanvasView: React.FC<MatrixCanvasViewProps> = ({
  style,
  variant = 'ambient',
}) => {
  const containerRef = useRef<View>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<MatrixRenderer | null>(null);

  const {
    phase,
    spectrum,
    glyphSet,
    speedMultiplier,
    audioEnabled,
    crtShader,
    bloomGlow,
    interactiveTouch,
    isOpen,
  } = useMatrixStore();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    if (!document.getElementById('matrix-font')) {
      const link = document.createElement('link');
      link.id = 'matrix-font';
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap';
      document.head.appendChild(link);
    }

    const container = containerRef.current as unknown as HTMLElement;
    if (!container) return;

    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.zIndex = '0';
      canvas.style.pointerEvents = variant === 'director' ? 'auto' : 'none';
      container.appendChild(canvas);
      canvasRef.current = canvas;
    }

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const renderer = new MatrixRenderer(canvas, {
      spectrum,
      speedMultiplier,
      glyphSet,
      audioEnabled: variant === 'director' ? audioEnabled : false,
      crtShader: variant === 'director' ? crtShader : false,
      bloomGlow: variant === 'director' ? bloomGlow : false,
      interactiveTouch: variant === 'director' ? interactiveTouch : false,
    });
    renderer.setVariant(variant);
    renderer.resize(width, height);
    renderer.setPhase(variant === 'ambient' ? 'PHASE_4_RAIN' : phase);
    if (variant === 'ambient') renderer.restartLoop();
    renderer.start();
    rendererRef.current = renderer;

    const handleResize = () => {
      if (!canvas || !container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      renderer.resize(w, h);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      renderer.setTouch(e.clientX - rect.left, e.clientY - rect.top, true);
    };

    const handleMouseLeave = () => {
      renderer.setTouch(-9999, -9999, false);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const rect = canvas.getBoundingClientRect();
        renderer.setTouch(
          e.touches[0].clientX - rect.left,
          e.touches[0].clientY - rect.top,
          true
        );
      }
    };

    const handleTouchEnd = () => {
      renderer.setTouch(-9999, -9999, false);
    };

    window.addEventListener('resize', handleResize);
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    const onVisibility = () => {
      if (typeof document === 'undefined') return;
      if (document.hidden) renderer.stop();
      else renderer.start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    if (variant === 'director') {
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('mouseleave', handleMouseLeave);
      canvas.addEventListener('touchmove', handleTouchMove, { passive: true });
      canvas.addEventListener('touchend', handleTouchEnd);
    }

    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    fonts?.ready?.then(() => handleResize()).catch(() => {});

    return () => {
      renderer.stop();
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', onVisibility);
      ro.disconnect();
      canvas?.removeEventListener('mousemove', handleMouseMove);
      canvas?.removeEventListener('mouseleave', handleMouseLeave);
      canvas?.removeEventListener('touchmove', handleTouchMove);
      canvas?.removeEventListener('touchend', handleTouchEnd);
      if (canvas && container.contains(canvas)) {
        container.removeChild(canvas);
      }
      canvasRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!rendererRef.current) return;
    if (variant === 'ambient') return;
    rendererRef.current.setPhase(phase);
  }, [phase, variant]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setSpectrum(spectrum);
    }
  }, [spectrum]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setConfig({
        speedMultiplier,
        glyphSet,
        audioEnabled: variant === 'director' ? audioEnabled : false,
        crtShader,
        bloomGlow,
        interactiveTouch: variant === 'director' ? interactiveTouch : false,
      });
    }
  }, [speedMultiplier, glyphSet, audioEnabled, crtShader, bloomGlow, interactiveTouch, variant]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || variant !== 'ambient') return;
    if (isOpen) renderer.stop();
    else renderer.start();
  }, [isOpen, variant]);

  return (
    <View
      ref={containerRef}
      style={[styles.container, style]}
      pointerEvents={variant === 'director' ? 'auto' : 'none'}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#04070c',
    overflow: 'hidden',
  },
});
