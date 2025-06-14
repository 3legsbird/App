"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app"
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  getDoc,
  where,
  getDocs,
  type Firestore,
} from "firebase/firestore"
import { getAuth, signInAnonymously, onAuthStateChanged, type User } from "firebase/auth"

// Default configuration - replace with your Firebase config
const DEFAULT_APP_ID = "default-app-id"
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDHmCtgynMTLsxLjGVvR-FEh7sN3-0H0jo",
  authDomain: "sample-chat-appp.firebaseapp.com",
  projectId: "sample-chat-appp",
  storageBucket: "sample-chat-appp.firebasestorage.app",
  messagingSenderId: "53107530515",

}

export default function App() {
  const [app, setApp] = useState<FirebaseApp | null>(null)
  const [db, setDb] = useState<Firestore | null>(null)
  const [auth, setAuth] = useState<any>(null)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [isAuthReady, setIsAuthReady] = useState(false)

  const [userId, setUserId] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [job, setJob] = useState<string | null>(null)
  const [isUserInfoSet, setIsUserInfoSet] = useState(false)

  const [activeTab, setActiveTab] = useState("feed")
  const [posts, setPosts] = useState<any[]>([])
  const [newPost, setNewPost] = useState("")
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [loadingPosts, setLoadingPosts] = useState(true)
  const [conversations, setConversations] = useState<any[]>([])
  const [selectedConversation, setSelectedConversation] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [newMessageText, setNewMessageText] = useState("")
  const [isGeneratingPost, setIsGeneratingPost] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Get app configuration
  const appId = (typeof window !== "undefined" && (window as any).__app_id) || DEFAULT_APP_ID
  const firebaseConfig =
    typeof window !== "undefined" && (window as any).__firebase_config
      ? JSON.parse((window as any).__firebase_config)
      : DEFAULT_FIREBASE_CONFIG

  // Initialize Firebase and handle authentication
  useEffect(() => {
    if (!getApps().length) {
      try {
        const firebaseAppInstance = initializeApp(firebaseConfig)
        setApp(firebaseAppInstance)
        const firestoreInstance = getFirestore(firebaseAppInstance)
        setDb(firestoreInstance)
        const authInstance = getAuth(firebaseAppInstance)
        setAuth(authInstance)

        const unsubscribeAuth = onAuthStateChanged(authInstance, async (user) => {
          if (user) {
            setCurrentUser(user)
            setUserId(user.uid)
            console.log("Firebase authenticated, UID:", user.uid)

            const storedUsername = localStorage.getItem(`username_${user.uid}`)
            const storedJob = localStorage.getItem(`job_${user.uid}`)

            if (storedUsername && storedJob) {
              setUsername(storedUsername)
              setJob(storedJob)
              setIsUserInfoSet(true)
            } else {
              const userProfileRef = doc(firestoreInstance, `artifacts/${appId}/users/${user.uid}/profile`, "info")
              const userProfileSnap = await getDoc(userProfileRef)
              if (userProfileSnap.exists()) {
                const data = userProfileSnap.data()
                setUsername(data.username)
                setJob(data.job)
                localStorage.setItem(`username_${user.uid}`, data.username)
                localStorage.setItem(`job_${user.uid}`, data.job)
                setIsUserInfoSet(true)
              } else {
                setIsUserInfoSet(false)
              }
            }
          } else {
            console.log("Attempting anonymous sign-in.")
            try {
              const anonymousUserCredential = await signInAnonymously(authInstance)
              setCurrentUser(anonymousUserCredential.user)
              setUserId(anonymousUserCredential.user.uid)
              console.log("Anonymous sign-in successful:", anonymousUserCredential.user.uid)
              setIsUserInfoSet(false)
            } catch (error) {
              console.error("Anonymous sign-in error:", error)
            }
          }
          setIsAuthReady(true)
        })

        return () => unsubscribeAuth()
      } catch (error) {
        console.error("Firebase initialization error:", error)
        setIsAuthReady(true) // Set to true even on error to show the app
      }
    } else {
      const firebaseAppInstance = getApp()
      setApp(firebaseAppInstance)
      setDb(getFirestore(firebaseAppInstance))
      setAuth(getAuth(firebaseAppInstance))
      setIsAuthReady(true)
    }
  }, [])

  const handleSetUserInfo = async (name: string, userJob: string) => {
    if (!currentUser || !db) {
      console.error("No authenticated user or DB available.")
      return
    }
    const currentUserId = currentUser.uid
    localStorage.setItem(`userId`, currentUserId)
    localStorage.setItem(`username_${currentUserId}`, name)
    localStorage.setItem(`job_${currentUserId}`, userJob)

    setUserId(currentUserId)
    setUsername(name)
    setJob(userJob)
    setIsUserInfoSet(true)

    try {
      const userProfileRef = doc(db, `artifacts/${appId}/users/${currentUserId}/profile`, "info")
      await setDoc(
        userProfileRef,
        {
          username: name,
          job: userJob,
          createdAt: serverTimestamp(),
        },
        { merge: true },
      )
      console.log("User info saved to Firestore.")
    } catch (error) {
      console.error("Error saving user info to Firestore:", error)
    }
  }

  // Fetch posts from Firebase (real-time)
  useEffect(() => {
    if (db && isUserInfoSet && isAuthReady) {
      setLoadingPosts(true)
      const postsCollectionRef = collection(db, `artifacts/${appId}/public/data/posts`)
      const q = query(postsCollectionRef, orderBy("timestamp", "desc"))

      const unsubscribe = onSnapshot(
        q,
        async (snapshot) => {
          const postsData = await Promise.all(
            snapshot.docs.map(async (postDoc) => {
              const post = {
                id: postDoc.id,
                ...postDoc.data(),
                timestamp: postDoc.data().timestamp?.toDate
                  ? postDoc.data().timestamp.toDate()
                  : new Date(postDoc.data().timestamp || Date.now()),
                likedBy: postDoc.data().likedBy || [],
              }

              const commentsCollectionRef = collection(db, `artifacts/${appId}/public/data/posts/${post.id}/comments`)
              const commentsQuery = query(commentsCollectionRef, orderBy("timestamp", "asc"))
              const commentsSnapshot = await getDocs(commentsQuery)
              post.commentsData = commentsSnapshot.docs.map((commentDoc) => ({
                id: commentDoc.id,
                ...commentDoc.data(),
                timestamp: commentDoc.data().timestamp?.toDate
                  ? commentDoc.data().timestamp.toDate()
                  : new Date(commentDoc.data().timestamp || Date.now()),
              }))
              return post
            }),
          )
          setPosts(postsData)
          setLoadingPosts(false)
        },
        (error) => {
          console.error("Error fetching posts:", error)
          setLoadingPosts(false)
        },
      )
      return () => unsubscribe()
    } else {
      setPosts([])
      setLoadingPosts(false)
    }
  }, [db, isUserInfoSet, isAuthReady, appId])

  // Fetch conversations (real-time)
  useEffect(() => {
    if (db && isUserInfoSet && userId && isAuthReady) {
      const chatsCollectionRef = collection(db, `artifacts/${appId}/public/data/chats`)
      const q = query(chatsCollectionRef, where("participants", "array-contains", userId))

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const chatsData = snapshot.docs
            .map((doc) => ({
              id: doc.id,
              ...doc.data(),
              lastMessageTimestamp: doc.data().lastMessageTimestamp?.toDate
                ? doc.data().lastMessageTimestamp.toDate()
                : new Date(doc.data().lastMessageTimestamp || Date.now()),
            }))
            .sort((a, b) => b.lastMessageTimestamp.getTime() - a.lastMessageTimestamp.getTime())
          setConversations(chatsData)
        },
        (error) => {
          console.error("Error fetching conversations:", error)
        },
      )
      return () => unsubscribe()
    } else {
      setConversations([])
    }
  }, [db, isUserInfoSet, userId, isAuthReady, appId])

  // Fetch messages for selected conversation (real-time)
  useEffect(() => {
    if (db && selectedConversation && isAuthReady) {
      const messagesCollectionRef = collection(
        db,
        `artifacts/${appId}/public/data/chats/${selectedConversation.id}/messages`,
      )
      const q = query(messagesCollectionRef, orderBy("timestamp", "asc"))

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const msgs = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            timestamp: doc.data().timestamp?.toDate
              ? doc.data().timestamp.toDate()
              : new Date(doc.data().timestamp || Date.now()),
          }))
          setMessages(msgs)
        },
        (error) => {
          console.error("Error fetching messages:", error)
        },
      )
      return () => unsubscribe()
    } else {
      setMessages([])
    }
  }, [db, selectedConversation, isAuthReady, appId])

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleCreatePost = async () => {
    if (!db || !isUserInfoSet || !userId) {
      console.log("Database not ready or user info not set.")
      return
    }
    if (newPost.trim()) {
      try {
        await addDoc(collection(db, `artifacts/${appId}/public/data/posts`), {
          author: username || "Anonymous",
          username: `${username || "Anonymous"} (${job || "No job specified"})`,
          content: newPost,
          likes: 0,
          comments: 0,
          likedBy: [],
          avatar: `https://placehold.co/100x100?text=${username ? username.substring(0, 2).toUpperCase() : "??"}`,
          authorId: userId,
          timestamp: serverTimestamp(),
        })
        setNewPost("")
      } catch (error) {
        console.error("Error creating post:", error)
      }
    }
  }

  const handleImprovePost = async () => {
    if (!newPost.trim()) {
      alert("Please enter some text to improve.")
      return
    }

    setIsGeneratingPost(true)
    try {
      // This is a demo - in a real app, you'd use a proper API key and endpoint
      const improvedText = `✨ ${newPost} 

#trending #socialmedia #inspiration 🚀

This post has been enhanced with AI! 🤖`

      setNewPost(improvedText)
    } catch (error) {
      console.error("Error improving post:", error)
      alert("Error improving post. Please try again later.")
    } finally {
      setIsGeneratingPost(false)
    }
  }

  const handleLike = async (postId: string, currentLikedBy: string[]) => {
    if (!db || !isUserInfoSet || !userId) {
      console.log("Database not ready or user info not set.")
      return
    }
    try {
      const postRef = doc(db, `artifacts/${appId}/public/data/posts`, postId)
      const isLiked = currentLikedBy.includes(userId)

      if (isLiked) {
        await updateDoc(postRef, {
          likes: Math.max(0, currentLikedBy.length - 1),
          likedBy: arrayRemove(userId),
        })
      } else {
        await updateDoc(postRef, {
          likes: currentLikedBy.length + 1,
          likedBy: arrayUnion(userId),
        })
      }
    } catch (error) {
      console.error("Error liking post:", error)
    }
  }

  const handleAddComment = async (postId: string, commentContent: string) => {
    if (!db || !isUserInfoSet || !userId || !commentContent.trim()) {
      console.log("Database not ready, user info not set, or comment is empty.")
      return
    }
    try {
      const commentsCollectionRef = collection(db, `artifacts/${appId}/public/data/posts/${postId}/comments`)

      await addDoc(commentsCollectionRef, {
        authorId: userId,
        authorUsername: `@${username || "Anonymous"}`,
        content: commentContent,
        avatar: `https://placehold.co/100x100?text=${username ? username.substring(0, 2).toUpperCase() : "??"}`,
        timestamp: serverTimestamp(),
      })

      const commentInput = document.getElementById(`comment-input-${postId}`) as HTMLInputElement
      if (commentInput) {
        commentInput.value = ""
      }
    } catch (error) {
      console.error("Error adding comment:", error)
    }
  }

  const handleCreateNewConversation = async (targetUserId: string, targetUsername: string) => {
    if (!db || !userId || !username) {
      console.log("DB, user ID, or username not available.")
      return
    }

    if (targetUserId === userId) {
      alert("You cannot start a conversation with yourself.")
      return
    }

    const existingChatQuery = query(
      collection(db, `artifacts/${appId}/public/data/chats`),
      where("participants", "array-contains", userId),
    )
    const existingChatsSnapshot = await getDocs(existingChatQuery)
    let existingChat = null
    existingChatsSnapshot.forEach((doc) => {
      const data = doc.data()
      if (data.participants.includes(targetUserId)) {
        existingChat = { id: doc.id, ...data }
      }
    })

    if (existingChat) {
      console.log("Conversation already exists:", existingChat.id)
      setSelectedConversation(existingChat)
      setActiveTab("messages")
      return
    }

    try {
      const newChatRef = await addDoc(collection(db, `artifacts/${appId}/public/data/chats`), {
        participants: [userId, targetUserId],
        participantNames: {
          [userId]: username,
          [targetUserId]: targetUsername,
        },
        lastMessage: "Conversation started!",
        lastMessageTimestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
      })
      console.log("New conversation created:", newChatRef.id)
      setSelectedConversation({
        id: newChatRef.id,
        participants: [userId, targetUserId],
        participantNames: {
          [userId]: username,
          [targetUserId]: targetUsername,
        },
        lastMessage: "Conversation started!",
        lastMessageTimestamp: new Date(),
      })
      setActiveTab("messages")
    } catch (error) {
      console.error("Error creating new conversation:", error)
    }
  }

  const handleSendMessage = async () => {
    if (!db || !selectedConversation || !isUserInfoSet || !userId || !newMessageText.trim()) {
      console.log("Database not ready, no conversation selected, user info not set, or message is empty.")
      return
    }
    try {
      const chatRef = doc(db, `artifacts/${appId}/public/data/chats`, selectedConversation.id)
      const messagesCollectionRef = collection(
        db,
        `artifacts/${appId}/public/data/chats/${selectedConversation.id}/messages`,
      )

      await addDoc(messagesCollectionRef, {
        senderId: userId,
        senderUsername: `@${username || "Anonymous"}`,
        content: newMessageText,
        avatar: `https://placehold.co/100x100?text=${username ? username.substring(0, 2).toUpperCase() : "??"}`,
        timestamp: serverTimestamp(),
      })

      await updateDoc(chatRef, {
        lastMessage: newMessageText,
        lastMessageTimestamp: serverTimestamp(),
      })

      setNewMessageText("")
    } catch (error) {
      console.error("Error sending message:", error)
    }
  }

  // Dark mode effect
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }, [isDarkMode])

  const formatTimeAgo = (timestamp: Date | undefined) => {
    if (!timestamp) return "Just now"
    const dateObject = timestamp instanceof Date ? timestamp : new Date(timestamp)
    const seconds = Math.floor((new Date().getTime() - dateObject.getTime()) / 1000)

    let interval = seconds / 31536000
    if (interval > 1) return Math.floor(interval) + " years ago"
    interval = seconds / 2592000
    if (interval > 1) return Math.floor(interval) + " months ago"
    interval = seconds / 86400
    if (interval > 1) return Math.floor(interval) + " days ago"
    interval = seconds / 3600
    if (interval > 1) return Math.floor(interval) + " hours ago"
    interval = seconds / 60
    if (interval > 1) return Math.floor(interval) + " minutes ago"
    return Math.floor(seconds) + " seconds ago"
  }

  if (!isUserInfoSet && isAuthReady) {
    return <UserInfoForm onSetUserInfo={handleSetUserInfo} currentUserId={userId} />
  }

  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white">
        <div className="flex flex-col items-center">
          <svg
            className="animate-spin -ml-1 mr-3 h-10 w-10 text-red-500"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <p className="mt-4 text-lg">Loading app...</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${isDarkMode ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900"}`}
    >
      {/* Header */}
      <header
        className={`sticky top-0 z-10 backdrop-blur-md shadow-sm ${isDarkMode ? "bg-gray-800/80" : "bg-white/80"}`}
      >
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold bg-gradient-to-r from-red-500 to-pink-600 bg-clip-text text-transparent">
            RedNote
          </h1>

          <nav className="hidden md:flex space-x-6">
            <button
              onClick={() => setActiveTab("feed")}
              className={`font-medium ${activeTab === "feed" ? "text-red-500" : "text-gray-600 dark:text-gray-300"}`}
            >
              Feed
            </button>
            <button
              onClick={() => setActiveTab("network")}
              className={`font-medium ${activeTab === "network" ? "text-red-500" : "text-gray-600 dark:text-gray-300"}`}
            >
              Network
            </button>
            <button
              onClick={() => setActiveTab("messages")}
              className={`font-medium ${activeTab === "messages" ? "text-red-500" : "text-gray-600 dark:text-gray-300"}`}
            >
              Messages
            </button>
            <button
              onClick={() => setActiveTab("notifications")}
              className={`font-medium ${activeTab === "notifications" ? "text-red-500" : "text-gray-600 dark:text-gray-300"}`}
            >
              Notifications
            </button>
          </nav>

          <div className="flex items-center space-x-4">
            {userId && (
              <span className="text-sm text-gray-600 dark:text-gray-300 hidden sm:block">
                {username || "Unknown"} ({job || "No job specified"}) | ID: {userId.substring(0, 8)}...
              </span>
            )}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              {isDarkMode ? <SunIcon /> : <MoonIcon />}
            </button>
            <img
              src={`https://placehold.co/40x40?text=${username ? username.substring(0, 2).toUpperCase() : "??"}`}
              alt="Profile"
              className="w-10 h-10 rounded-full object-cover"
            />
            <button
              onClick={() => setIsUserInfoSet(false)}
              className="px-3 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm"
            >
              Edit Profile
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-20">
        <div className="flex justify-around">
          <button
            onClick={() => setActiveTab("feed")}
            className={`py-3 flex flex-col items-center ${activeTab === "feed" ? "text-red-500" : "text-gray-600 dark:text-gray-300"}`}
          >
            <HomeIcon />
            <span className="text-xs mt-1">Feed</span>
          </button>
          <button
            onClick={() => setActiveTab("network")}
            className={`py-3 flex flex-col items-center ${activeTab === "network" ? "text-red-500" : "text-gray-600 dark:text-gray-300"}`}
          >
            <UsersIcon />
            <span className="text-xs mt-1">Network</span>
          </button>
          <button
            onClick={() => setActiveTab("messages")}
            className={`py-3 flex flex-col items-center ${activeTab === "messages" ? "text-red-500" : "text-gray-600 dark:text-gray-300"}`}
          >
            <MessageIcon />
            <span className="text-xs mt-1">Messages</span>
          </button>
          <button
            onClick={() => setActiveTab("notifications")}
            className={`py-3 flex flex-col items-center ${activeTab === "notifications" ? "text-red-500" : "text-gray-600 dark:text-gray-300"}`}
          >
            <BellIcon />
            <span className="text-xs mt-1">Notifications</span>
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-4 pt-6 pb-20 md:pb-6">
        {activeTab === "feed" && (
          <>
            {/* Create Post Section */}
            <div className={`mb-6 p-4 rounded-lg shadow-sm ${isDarkMode ? "bg-gray-800" : "bg-white"}`}>
              <textarea
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                placeholder="What's on your mind?"
                rows={3}
                className={`w-full p-3 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-red-500 ${isDarkMode ? "bg-gray-700 text-white" : "bg-gray-100 text-gray-900"}`}
              ></textarea>
              <div className="mt-3 flex justify-end space-x-3">
                <button
                  onClick={handleImprovePost}
                  disabled={isGeneratingPost}
                  className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingPost ? (
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  ) : (
                    "✨ Improve Post"
                  )}
                </button>
                <button
                  onClick={handleCreatePost}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                >
                  Create Post
                </button>
              </div>
            </div>

            {/* Posts Feed */}
            <div className="space-y-6">
              {loadingPosts ? (
                <div className={`p-4 rounded-lg shadow-sm text-center ${isDarkMode ? "bg-gray-800" : "bg-white"}`}>
                  Loading posts...
                </div>
              ) : posts.length === 0 ? (
                <div className={`p-4 rounded-lg shadow-sm text-center ${isDarkMode ? "bg-gray-800" : "bg-white"}`}>
                  No posts found. Create the first post!
                </div>
              ) : (
                posts.map((post) => (
                  <div
                    key={post.id}
                    className={`rounded-lg shadow-sm overflow-hidden ${isDarkMode ? "bg-gray-800" : "bg-white"}`}
                  >
                    <div className="p-4 flex items-start">
                      <img
                        src={post.avatar || "/placeholder.svg"}
                        alt={post.author}
                        className="w-10 h-10 rounded-full mr-3"
                      />
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-semibold">{post.author}</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{post.username}</p>
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatTimeAgo(post.timestamp)}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap">{post.content}</p>
                      </div>
                    </div>
                    <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-2 flex justify-between">
                      <button
                        onClick={() => handleLike(post.id, post.likedBy)}
                        className={`flex items-center space-x-1 transition-colors ${post.likedBy.includes(userId) ? "text-red-500" : "text-gray-500 hover:text-red-500"}`}
                      >
                        <LikeIcon fill={post.likedBy.includes(userId) ? "currentColor" : "none"} />
                        <span>{post.likedBy.length}</span>
                      </button>
                      <div className="flex items-center space-x-1 text-gray-500">
                        <CommentIcon />
                        <span>{post.commentsData?.length || 0}</span>
                      </div>
                    </div>
                    {/* Comments Section */}
                    <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                      <h4 className="font-semibold mb-2">Comments ({post.commentsData?.length || 0})</h4>
                      <div className="space-y-3 max-h-40 overflow-y-auto pr-2">
                        {post.commentsData && post.commentsData.length > 0 ? (
                          post.commentsData.map((comment: any) => (
                            <div key={comment.id} className="flex items-start">
                              <img
                                src={comment.avatar || "/placeholder.svg"}
                                alt={comment.authorUsername}
                                className="w-8 h-8 rounded-full mr-2"
                              />
                              <div>
                                <p className="text-sm">
                                  <span className="font-semibold">{comment.authorUsername}</span> {comment.content}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {formatTimeAgo(comment.timestamp)}
                                </p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            No comments yet. Be the first to comment!
                          </p>
                        )}
                      </div>
                      <div className="mt-4 flex">
                        <input
                          type="text"
                          placeholder="Write a comment..."
                          id={`comment-input-${post.id}`}
                          className={`flex-1 p-2 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? "bg-gray-700 text-white" : "bg-gray-100 text-gray-900"}`}
                          onKeyPress={(e) => {
                            if (e.key === "Enter") {
                              handleAddComment(post.id, (e.target as HTMLInputElement).value)
                            }
                          }}
                        />
                        <button
                          onClick={() =>
                            handleAddComment(
                              post.id,
                              (document.getElementById(`comment-input-${post.id}`) as HTMLInputElement).value,
                            )
                          }
                          className="px-4 py-2 bg-blue-500 text-white rounded-r-lg hover:bg-blue-600 transition-colors"
                        >
                          Comment
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {activeTab === "network" && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold mb-4">Network Users</h2>
            <div className={`p-4 rounded-lg shadow-sm ${isDarkMode ? "bg-gray-800" : "bg-white"}`}>
              <p className="text-gray-500 dark:text-gray-400">
                In this section, you can find other users and connect with them. Currently, there's no data here, but
                this feature may be added in the future. Below are some sample users for testing:
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { id: "sampleUser1", name: "John Smith", job: "Developer" },
                { id: "sampleUser2", name: "Sarah Johnson", job: "Designer" },
                { id: "sampleUser3", name: "Mike Wilson", job: "Marketing Specialist" },
              ].map((user) => (
                <div key={user.id} className={`p-4 rounded-lg shadow-sm ${isDarkMode ? "bg-gray-800" : "bg-white"}`}>
                  <img
                    src={`https://placehold.co/150x150?text=${user.name.substring(0, 2).toUpperCase()}`}
                    alt={user.name}
                    className="w-20 h-20 rounded-full mx-auto mb-4"
                  />
                  <h3 className="text-center font-semibold">{user.name}</h3>
                  <p className="text-center text-sm text-gray-500 dark:text-gray-400">{user.job}</p>
                  <button
                    onClick={() => handleCreateNewConversation(user.id, user.name)}
                    className="mt-3 w-full py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                  >
                    Connect
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "messages" && (
          <div className={`rounded-lg shadow-sm overflow-hidden ${isDarkMode ? "bg-gray-800" : "bg-white"}`}>
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold">Messages</h2>
            </div>
            <div className="flex flex-col md:flex-row">
              {/* Conversation List */}
              <div className="w-full md:w-1/3 border-r border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700 max-h-[600px] overflow-y-auto">
                {conversations.length === 0 ? (
                  <div className="p-4 text-gray-500 dark:text-gray-400">No conversations yet.</div>
                ) : (
                  conversations.map((conv) => {
                    const otherParticipantId = conv.participants.find((p: string) => p !== userId)
                    const otherParticipantName = conv.participantNames?.[otherParticipantId] || "Unknown User"
                    return (
                      <div
                        key={conv.id}
                        className={`p-4 flex items-center cursor-pointer ${selectedConversation?.id === conv.id ? "bg-red-100 dark:bg-red-700" : "hover:bg-gray-50 dark:hover:bg-gray-700"}`}
                        onClick={() => setSelectedConversation(conv)}
                      >
                        <img
                          src={`https://placehold.co/50x50?text=${otherParticipantName.substring(0, 2).toUpperCase()}`}
                          alt="Participant"
                          className="w-10 h-10 rounded-full mr-3"
                        />
                        <div className="flex-1">
                          <h3 className="font-medium">{otherParticipantName}</h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                            {conv.lastMessage || "No conversation"}
                          </p>
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {formatTimeAgo(conv.lastMessageTimestamp)}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Message Detail */}
              <div className="w-full md:w-2/3 flex flex-col h-[600px]">
                {selectedConversation ? (
                  <>
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center">
                      {(() => {
                        const otherParticipantId = selectedConversation.participants.find((p: string) => p !== userId)
                        const otherParticipantName =
                          selectedConversation.participantNames?.[otherParticipantId] || "Unknown User"
                        return (
                          <>
                            <img
                              src={`https://placehold.co/50x50?text=${otherParticipantName.substring(0, 2).toUpperCase()}`}
                              alt="Participant"
                              className="w-10 h-10 rounded-full mr-3"
                            />
                            <h3 className="font-semibold">{otherParticipantName}</h3>
                          </>
                        )
                      })()}
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto space-y-4">
                      {messages.length === 0 ? (
                        <div className="text-center text-gray-500 dark:text-gray-400">
                          No messages in this conversation yet.
                        </div>
                      ) : (
                        messages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`flex ${msg.senderId === userId ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`p-3 max-w-xs rounded-lg ${msg.senderId === userId ? "bg-red-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white"}`}
                            >
                              <p className="font-semibold text-xs mb-1">
                                {msg.senderId === userId ? "You" : `@${msg.senderUsername.replace("@", "")}`}
                              </p>
                              <p>{msg.content}</p>
                              <span className="block text-right text-xs mt-1 opacity-75">
                                {formatTimeAgo(msg.timestamp)}
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                    <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex">
                      <input
                        type="text"
                        value={newMessageText}
                        onChange={(e) => setNewMessageText(e.target.value)}
                        placeholder="Type a message..."
                        className={`flex-1 p-2 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? "bg-gray-700 text-white" : "bg-gray-100 text-gray-900"}`}
                        onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                      />
                      <button
                        onClick={handleSendMessage}
                        className="px-4 py-2 bg-blue-500 text-white rounded-r-lg hover:bg-blue-600 transition-colors"
                      >
                        Send
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
                    Select a conversation
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "notifications" && (
          <div className={`rounded-lg shadow-sm overflow-hidden ${isDarkMode ? "bg-gray-800" : "bg-white"}`}>
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold">Notifications</h2>
            </div>
            <div className="p-4 text-gray-500 dark:text-gray-400 text-center">
              No notifications at the moment. This feature may be added in the future!
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// User info form component
function UserInfoForm({
  onSetUserInfo,
  currentUserId,
}: { onSetUserInfo: (username: string, job: string) => void; currentUserId: string | null }) {
  const [name, setName] = useState("")
  const [job, setJob] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim() && job.trim()) {
      onSetUserInfo(name, job)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="p-8 rounded-lg shadow-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white max-w-md w-full">
        <h2 className="text-2xl font-bold mb-6 text-center">Welcome to RedNote!</h2>
        <p className="text-center mb-4 text-gray-600 dark:text-gray-300">
          Please enter your name and job to use the app.
        </p>
        {currentUserId && (
          <p className="text-center mb-4 text-sm text-gray-500 dark:text-gray-400">
            Your current ID: <strong>{currentUserId.substring(0, 8)}...</strong>
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium">
              Your Name:
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500 bg-gray-50 dark:bg-gray-700 dark:text-white"
              placeholder="Enter your name"
              required
            />
          </div>
          <div>
            <label htmlFor="job" className="block text-sm font-medium">
              Your Job:
            </label>
            <input
              type="text"
              id="job"
              value={job}
              onChange={(e) => setJob(e.target.value)}
              className="mt-1 block w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500 bg-gray-50 dark:bg-gray-700 dark:text-white"
              placeholder="Enter your job"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
          >
            Save Information
          </button>
        </form>
      </div>
    </div>
  )
}

// Icon components
const SunIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="lucide lucide-sun"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="M4.93 4.93l1.41 1.41" />
    <path d="M17.66 17.66l1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="M6.34 17.66l-1.41 1.41" />
    <path d="M19.07 4.93l-1.41 1.41" />
  </svg>
)

const MoonIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="lucide lucide-moon"
  >
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
)

const HomeIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="lucide lucide-home"
  >
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
)

const UsersIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="lucide lucide-users"
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

const MessageIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="lucide lucide-message-circle"
  >
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
  </svg>
)

const BellIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="lucide lucide-bell"
  >
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
)

const LikeIcon = ({ fill }: { fill: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="lucide lucide-heart"
  >
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.07 0 0 0 17.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.07 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
)

const CommentIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="lucide lucide-message-circle"
  >
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
  </svg>
)
