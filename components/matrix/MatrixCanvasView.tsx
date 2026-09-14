import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { MatrixRenderer } from '../../services/matrix/MatrixRenderer';
import { useMatrixStore } from '../../stores/useMatrixStore';

interface MatrixCanvasViewProps {
  style?: any;
}

export const MatrixCanvasView: React.FC<MatrixCanvasViewProps> = ({ style }) => {
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

    // Create or locate HTML5 canvas
    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.zIndex = '0';
      canvas.style.pointerEvents = 'auto';
      container.appendChild(canvas);
      canvasRef.current = canvas;
    }

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const renderer = new MatrixRenderer(canvas, {
      spectrum,
      speedMultiplier,
      glyphSet,
      audioEnabled,
      crtShader,
      bloomGlow,
      interactiveTouch,
    });
    renderer.resize(width, height);
    renderer.setPhase(phase);
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
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('touchmove', handleTouchMove, { passive: true });
    canvas.addEventListener('touchend', handleTouchEnd);

    return () => {
      renderer.stop();
      window.removeEventListener('resize', handleResize);
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

  // Update renderer when store state changes
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setPhase(phase);
    }
  }, [phase]);

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
        audioEnabled,
        crtShader,
        bloomGlow,
        interactiveTouch,
      });
    }
  }, [speedMultiplier, glyphSet, audioEnabled, crtShader, bloomGlow, interactiveTouch]);

  return <View ref={containerRef} style={[styles.container, style]} />;
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#04070c',
    overflow: 'hidden',
  },
});
