'use client';

import React, { useState, useCallback, useContext } from 'react';
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import ZupDriveAPI from '../../services/zupdrive-api';
import { AuthContext } from '../../lib/auth';

interface Message {
  id: string;
  authorId: string;
  authorType: string;
  message: string;
  createdAt: string;
}

interface TicketDetailProps {
  ticketId: string;
  onBack: () => void;
}

export function SupportTicketScreen({ ticketId, onBack }: TicketDetailProps) {
  const { user } = useContext(AuthContext);
  const driverId = user?.id || '';
  const token = user?.token || '';

  const [ticket, setTicket] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');

  const api = new ZupDriveAPI(token);

  // Charger le ticket et ses messages
  const loadTicket = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getTicketDetail(ticketId);
      setTicket(data);
      setMessages(data.messages || []);
    } catch (err) {
      console.error('Erreur:', err);
    } finally {
      setLoading(false);
    }
  }, [ticketId, api]);

  React.useEffect(() => {
    loadTicket();
    // Rafraîchir toutes les 10 secondes
    const interval = setInterval(loadTicket, 10000);
    return () => clearInterval(interval);
  }, [loadTicket]);

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    setSending(true);
    try {
      await api.addTicketMessage(ticketId, newMessage, driverId);
      setNewMessage('');
      await loadTicket();
    } catch (err) {
      console.error('Erreur:', err);
      alert('Erreur lors de l\'envoi du message');
    } finally {
      setSending(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OUVERT':
        return '#0066CC';
      case 'EN_COURS':
        return '#FFAA00';
      case 'RESOLU':
        return '#00AA00';
      case 'FERME':
        return '#999999';
      default:
        return '#666666';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'CRITIQUE':
        return '🔴';
      case 'HAUTE':
        return '🟠';
      case 'MOYENNE':
        return '🟡';
      case 'BASSE':
        return '🟢';
      default:
        return '⚪';
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0066CC" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* En-tête */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ticket Support</Text>
      </View>

      {/* Détails du ticket */}
      {ticket && (
        <View style={styles.content}>
          <View style={styles.ticketInfo}>
            <View style={styles.ticketHeader}>
              <View>
                <Text style={styles.ticketNumber}>{ticket.ticketNumber}</Text>
                <Text style={styles.ticketSubject}>{ticket.subject}</Text>
              </View>
              <Text style={styles.priorityIcon}>{getPriorityIcon(ticket.priority)}</Text>
            </View>

            <View style={styles.ticketMeta}>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Statut</Text>
                <Text style={[styles.metaValue, { color: getStatusColor(ticket.status) }]}>
                  {ticket.status}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Priorité</Text>
                <Text style={styles.metaValue}>{ticket.priority}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Catégorie</Text>
                <Text style={styles.metaValue}>{ticket.category}</Text>
              </View>
            </View>

            <View style={styles.ticketDescription}>
              <Text style={styles.descriptionTitle}>Description</Text>
              <Text style={styles.descriptionText}>{ticket.description}</Text>
            </View>
          </View>

          {/* Messages */}
          <View style={styles.messagesSection}>
            <Text style={styles.sectionTitle}>Messages ({messages.length})</Text>

            {messages.length === 0 ? (
              <Text style={styles.noMessages}>Aucun message pour l'instant</Text>
            ) : (
              <FlatList
                data={messages}
                keyExtractor={(m) => m.id}
                scrollEnabled={false}
                renderItem={({ item: msg }) => (
                  <View
                    style={[
                      styles.message,
                      msg.authorType === 'CHAUFFEUR' ? styles.messageUser : styles.messageAgent,
                    ]}
                  >
                    <Text style={styles.messageAuthor}>{msg.authorType}</Text>
                    <Text style={styles.messageText}>{msg.message}</Text>
                    <Text style={styles.messageDate}>
                      {new Date(msg.createdAt).toLocaleString('fr-FR')}
                    </Text>
                  </View>
                )}
              />
            )}
          </View>

          {/* Input pour nouveau message */}
          {!['RESOLU', 'FERME'].includes(ticket.status) && (
            <View style={styles.inputSection}>
              <TextInput
                style={styles.input}
                placeholder="Votre message..."
                value={newMessage}
                onChangeText={setNewMessage}
                multiline
                editable={!sending}
              />
              <TouchableOpacity
                style={[styles.sendButton, sending && styles.sendButtonDisabled]}
                onPress={handleSendMessage}
                disabled={sending || !newMessage.trim()}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.sendButtonText}>Envoyer</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    paddingRight: 16,
  },
  backText: {
    color: '#0066CC',
    fontSize: 16,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1,
  },
  content: {
    flex: 1,
  },
  ticketInfo: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  ticketNumber: {
    fontSize: 12,
    color: '#999',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  ticketSubject: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  priorityIcon: {
    fontSize: 24,
  },
  ticketMeta: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 11,
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  ticketDescription: {
    marginTop: 12,
  },
  descriptionTitle: {
    fontSize: 12,
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 8,
    fontWeight: '600',
  },
  descriptionText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  messagesSection: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  noMessages: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 24,
  },
  message: {
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
  },
  messageUser: {
    backgroundColor: '#E3F2FD',
    alignSelf: 'flex-end',
    maxWidth: '85%',
  },
  messageAgent: {
    backgroundColor: '#F5F5F5',
    alignSelf: 'flex-start',
    maxWidth: '85%',
  },
  messageAuthor: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14,
    color: '#1a1a1a',
    marginBottom: 6,
  },
  messageDate: {
    fontSize: 11,
    color: '#999',
  },
  inputSection: {
    backgroundColor: '#fff',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#0066CC',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
