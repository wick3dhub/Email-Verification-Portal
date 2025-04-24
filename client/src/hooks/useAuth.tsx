import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { AuthUser, LoginCredentials } from '@/lib/types';

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  checkAuthStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start as loading to check auth on init
  const [error, setError] = useState<string | null>(null);

  // Check auth status on component mount
  useEffect(() => {
    const checkAuth = async () => {
      setIsLoading(true);
      try {
        // Use fetch directly with better error handling
        const response = await fetch('/api/auth/check', {
          credentials: 'include', // Important: Send cookies with the request
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          }
        });
        
        // Check if response is ok (status 200-299)
        if (response.ok) {
          const data = await response.json();
          if (data.authenticated && data.user) {
            console.log('Authentication successful:', data.user);
            setUser(data.user);
          } else {
            console.log('No authentication data returned');
            setUser(null);
          }
        } else {
          // If status is 401, user is not authenticated
          if (response.status === 401) {
            console.log('User not authenticated (401)');
          } else {
            console.error('Auth check failed with status:', response.status);
          }
          setUser(null);
        }
      } catch (err) {
        console.error('Error checking auth status:', err);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };
    
    checkAuth();
  }, []);

  // Function to check if user is already authenticated
  const checkAuthStatus = async () => {
    setIsLoading(true);
    try {
      // Use fetch directly with better error handling
      const response = await fetch('/api/auth/check', {
        credentials: 'include', // Important: Send cookies with the request
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      
      // Check if response is ok (status 200-299)
      if (response.ok) {
        const data = await response.json();
        if (data.authenticated && data.user) {
          console.log('Authentication successful:', data.user);
          setUser(data.user);
        } else {
          console.log('No authentication data returned');
          setUser(null);
        }
      } else {
        // If status is 401, user is not authenticated
        if (response.status === 401) {
          console.log('User not authenticated (401)');
        } else {
          console.error('Auth check failed with status:', response.status);
        }
        setUser(null);
      }
    } catch (err) {
      console.error('Error checking auth status:', err);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (credentials: LoginCredentials) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include', // Important: Send and receive cookies
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(credentials)
      });

      if (response.ok) {
        const userData: AuthUser = await response.json();
        setUser(userData);
        console.log('Login successful:', userData);
        
        // Immediately check authentication status to verify session
        setTimeout(() => {
          checkAuthStatus();
        }, 500);
      } else {
        const errorData = await response.text();
        const errorMessage = errorData || 'Login failed';
        console.error('Login error:', errorMessage);
        setError(errorMessage);
        throw new Error(errorMessage);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include', // Important: Send cookies
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        console.log('Logout successful');
      } else {
        console.error('Logout error:', response.statusText);
      }
      
      // Always clear user state and redirect regardless of server response
      setUser(null);
      
      // Force a reload of the page to clear any client state
      window.location.href = '/auth';
    } catch (err) {
      console.error('Error during logout:', err);
      // Even on error, clear user state and redirect
      setUser(null);
      window.location.href = '/auth';
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, error, login, logout, checkAuthStatus }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
