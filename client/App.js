import * as React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider as PaperProvider } from 'react-native-paper';
import { View, Text, Button, FlatList, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Card, ActivityIndicator, TextInput, Switch, Avatar, IconButton } from 'react-native-paper';
import io from 'socket.io-client';

const Stack = createNativeStackNavigator();

const SOCKET_URL = 'http://192.168.0.95:3001'; 
export const socket = io(SOCKET_URL);

function HomeScreen({ navigation }) {
  const [lobbies, setLobbies] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    function handleLobbyList(list) {
      setLobbies(list);
      setLoading(false);
    }
    socket.emit('get_lobbies');
    socket.on('lobby_list', handleLobbyList);
    // Clean up
    return () => socket.off('lobby_list', handleLobbyList);
  }, []);

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 24, marginBottom: 20, alignSelf: 'center' }}>Lobbies</Text>
      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={lobbies}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => navigation.navigate('Lobby', { lobbyId: item.id })}>
              <Card style={{ marginBottom: 12 }}>
                <Card.Title title={item.name} subtitle={`Participants: ${item.participants} | Bots: ${item.bots}`} />
              </Card>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={{ alignSelf: 'center', marginTop: 32 }}>No lobbies found.</Text>}
        />
      )}
      <Button title="Create Lobby" onPress={() => navigation.navigate('CreateLobby')} />
    </View>
  );
}

function CreateLobbyScreen({ navigation }) {
  const [name, setName] = React.useState('');
  const [isPrivate, setIsPrivate] = React.useState(false);
  const [maxHumans, setMaxHumans] = React.useState('5');
  const [maxBots, setMaxBots] = React.useState('1');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleCreate = () => {
    setLoading(true);
    setError('');
    socket.emit(
      'create_lobby',
      {
        name: name || 'New Lobby',
        isPrivate,
        maxHumans: parseInt(maxHumans) || 5,
        maxBots: parseInt(maxBots) || 1,
      },
      (res) => {
        setLoading(false);
        if (res.success) {
          navigation.replace('Lobby', { lobbyId: res.id });
        } else {
          setError(res.error || 'Failed to create lobby');
        }
      }
    );
  };

  return (
    <View style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
      <Text style={{ fontSize: 24, marginBottom: 20, alignSelf: 'center' }}>Create Lobby</Text>
      <TextInput
        label="Lobby Name"
        value={name}
        onChangeText={setName}
        style={{ marginBottom: 12 }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Text>Private</Text>
        <Switch value={isPrivate} onValueChange={setIsPrivate} style={{ marginLeft: 8 }} />
      </View>
      <TextInput
        label="Max Humans"
        value={maxHumans}
        onChangeText={setMaxHumans}
        keyboardType="numeric"
        style={{ marginBottom: 12 }}
      />
      <TextInput
        label="Max Bots"
        value={maxBots}
        onChangeText={setMaxBots}
        keyboardType="numeric"
        style={{ marginBottom: 12 }}
      />
      {error ? <Text style={{ color: 'red', marginBottom: 8 }}>{error}</Text> : null}
      <Button title={loading ? 'Creating...' : 'Create'} onPress={handleCreate} disabled={loading} />
      <Button title="Back" onPress={() => navigation.goBack()} style={{ marginTop: 8 }} />
    </View>
  );
}

function LobbyScreen({ route, navigation }) {
  const { lobbyId } = route.params || {};
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState('');
  const [username, setUsername] = React.useState('Player' + Math.floor(Math.random() * 1000));
  const [lobby, setLobby] = React.useState(null);

  React.useEffect(() => {
    socket.emit('join_lobby', { lobbyId, username }, (res) => {
      if (!res.success) {
        alert(res.error || 'Failed to join lobby');
        navigation.goBack();
      } else {
        setLobby(res.lobby);
        // **FIX**: Filter out any potential undefined/null messages from the server
        setMessages((res.lobby.messages || []).filter(Boolean).reverse());
      }
    });

    function handleMessage(msg) {
      setMessages((prev) => [msg, ...prev]);
    }
    socket.on('chat_message', handleMessage);

    function handleLobbyUpdate(lobby) {
      setLobby(lobby);
    }
    socket.on('lobby_update', handleLobbyUpdate);

    return () => {
      socket.emit('leave_lobby', { lobbyId });
      socket.off('chat_message', handleMessage);
      socket.off('lobby_update', handleLobbyUpdate);
    };
  }, [lobbyId, username]);

  const handleSend = () => {
    if (input.trim()) {
      socket.emit('chat_message', { lobbyId, username, message: input.trim() });
      setInput('');
    }
  };

  const renderMessage = ({ item }) => {
    if (!item) {
        return null;
    }
    
    let displayName = item.sender;
    let avatar = null;

    if (item.sender === 'ChatBot') {
      avatar = <Avatar.Text size={36} label="🤖" />;
      displayName = 'ChatBot';
    } else if (item.sender === 'Game') {
      avatar = <Avatar.Text size={36} label="🎮" />;
      displayName = 'Game Event';
    } else {
      avatar = <Avatar.Text size={36} label={item.sender ? item.sender[0] : '?'} />;
    }

    return (
      <Card style={{ marginVertical: 6, marginHorizontal: 2, backgroundColor: item.sender === username ? '#e3f2fd' : '#fff' }}>
        <Card.Title
          title={displayName}
          subtitle={new Date(item.timestamp).toLocaleTimeString()}
          left={() => avatar}
        />
        <Card.Content>
          <Text style={{ fontSize: 16 }}>{item.message}</Text>
        </Card.Content>
      </Card>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#f6f8fa' }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 25}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 8, backgroundColor: '#1976d2' }}>
        <IconButton icon="arrow-left" color="#fff" size={24} onPress={() => navigation.goBack()} />
        <Text style={{ color: '#fff', fontSize: 20, flex: 1 }}>{lobby ? lobby.name : 'Lobby'}</Text>
        <Avatar.Text size={32} label={username[0]} style={{ backgroundColor: '#fff' }} color="#1976d2" />
      </View>
      <FlatList
        data={messages}
        keyExtractor={(_, idx) => idx.toString()}
        renderItem={renderMessage}
        contentContainerStyle={{ padding: 8, paddingBottom: 10 }}
        inverted
        style={{ flex: 1 }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 8, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#eee' }}>
        <TextInput
          mode="outlined"
          placeholder="Type a message..."
          value={input}
          onChangeText={setInput}
          style={{ flex: 1, marginRight: 8 }}
          onSubmitEditing={handleSend}
        />
        <IconButton icon="send" color="#1976d2" size={28} onPress={handleSend} disabled={!input.trim()} />
      </View>
    </KeyboardAvoidingView>
  );
}

export default function App() {
  return (
    <PaperProvider>
      <NavigationContainer>
        <Stack.Navigator 
            initialRouteName="Home"
            screenOptions={{ headerShown: false }} 
        >
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="CreateLobby" component={CreateLobbyScreen} />
          <Stack.Screen name="Lobby" component={LobbyScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}