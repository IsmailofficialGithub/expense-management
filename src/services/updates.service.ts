import * as Updates from 'expo-updates';
import { Alert } from 'react-native';

class UpdatesService {
    async checkForUpdate(): Promise<void> {
        try {
            if (__DEV__) {
                Alert.alert('Development Mode', 'Cannot check for updates in development mode.');
                return;
            }

            const update = await Updates.checkForUpdateAsync();

            if (update.isAvailable) {
                Alert.alert(
                    'Update Available',
                    'A new version of the app is available. Would you like to download and install it now?',
                    [
                        { text: 'Cancel', style: 'cancel' },
                        {
                            text: 'Update',
                            onPress: () => this.fetchUpdate(),
                        },
                    ]
                );
            } else {
                Alert.alert('No Updates', 'You are using the latest version of the app.');
            }
        } catch (error) {
            console.warn('Error checking for updates:', error);
            // Don't alert on automatic checks if it fails (e.g. offline)
            // Or assume offline if it fails
            // Alert.alert('Error', 'Failed to check for updates. Please try again later.');
        }
    }

    async fetchUpdate(): Promise<void> {
        try {
            await Updates.fetchUpdateAsync();
            Alert.alert(
                'Update Downloaded',
                'The update has been downloaded. The app will now restart to apply the changes.',
                [
                    {
                        text: 'Restart',
                        onPress: () => Updates.reloadAsync(),
                    },
                ]
            );
        } catch (error) {
            console.error('Error fetching update:', error);
            Alert.alert('Error', 'Failed to download the update.');
        }
    }
}

export const updatesService = new UpdatesService();
