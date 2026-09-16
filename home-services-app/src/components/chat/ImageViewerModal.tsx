import React from 'react';
import { Modal, View, Image, StyleSheet, TouchableOpacity, Text, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ImageViewerModalProps {
  visible: boolean;
  imageUrl: string | null;
  onClose: () => void;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({ visible, imageUrl, onClose }) => {
  if (!imageUrl) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={26} color="#F8FAFC" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Photo</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.imageContainer}>
          <Image source={{ uri: imageUrl }} style={styles.fullImage} resizeMode="contain" />
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16
  },
  closeBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '700' },
  imageContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  fullImage: { width: '100%', height: '100%' }
});
