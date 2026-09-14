import React from 'react';
import { StyleSheet, View, Modal, SafeAreaView } from 'react-native';
import { MatrixCanvasView } from './MatrixCanvasView';
import { MatrixDirectorHUD } from './MatrixDirectorHUD';
import { useMatrixStore } from '../../stores/useMatrixStore';

interface MatrixModalProps {
  visible: boolean;
  onClose: () => void;
}

export const MatrixModal: React.FC<MatrixModalProps> = ({ visible, onClose }) => {
  const setIsOpen = useMatrixStore((s) => s.setIsOpen);

  const handleClose = () => {
    setIsOpen(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Hardware-accelerated 60 FPS Canvas Rain & Skull */}
        <MatrixCanvasView variant="director" />

        {/* Floating Cybernetic Director HUD */}
        <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
          <MatrixDirectorHUD onClose={handleClose} />
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#04070c',
  },
  safeArea: {
    flex: 1,
  },
});
