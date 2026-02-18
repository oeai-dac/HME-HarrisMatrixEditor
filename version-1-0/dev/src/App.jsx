import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';

const HarrisMatrixEditor = () => {
  const [nodes, setNodes] = useState([]);

  const nodeTypees = {
    layer: { label: 'Layer', color: '#fef3c7', border: '#d97706', shape: 'rect', symbol: '▬' },
    deposit: { label: 'Deposit', color: '#dbeafe', border: '#2563eb', shape: 'rect', symbol: '▤' },
    fill: { label: 'Fill', color: '#fce7f3', border: '#db2777', shape: 'rect', symbol: '▥' },
    structure: { label: 'Structure', color: '#dcfce7', border: '#16a34a', shape: 'rect', symbol: '◆' },
    interface: { label: 'Interface', color: '#e0e7ff', border: '#4f46e5', shape: 'circle', symbol: '○' },
  };

  const [edges, setEdges] = useState([]);

  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [draggingNode, setDraggingNode] = useState(null);
  const [connecting, setConnecting] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [editingNode, setEditingNode] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [selectedNodes, setSelectedNodes] = useState(new Set());
  const [selectionRect, setSelectionRect] = useState(null);
  const [selectionStart, setSelectionStart] = useState(null);
  const [phases, setPhases] = useState([]);
  const [showPhaseManager, setShowPhaseManager] = useState(false);
  const [showLayoutSettings, setShowLayoutSettings] = useState(false);
  const [layoutSettings, setLayoutSettings] = useState({
    nodesPerRow: 15,
    horizontalGap: 20,
    verticalGap: 50,
    phaseGap: 70
  });
  const [objects, setObjects] = useState([]);
  const [showObjectManager, setShowObjectManager] = useState(false);
  const [phaseDragState, setPhaseDragState] = useState({ dragging: null, over: null });
  const [selectedObject, setSelectedObject] = useState(null);
  const [showValidation, setShowValidation] = useState(false);
  const [validationResults, setValidationResults] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [geoImportModal, setGeoImportModal] = useState({ show: false, features: [], attributeKeys: [], selectedKey: '', preview: [] });
  const [highlightedNode, setHighlightedNode] = useState(null);
  const [flashingNode, setFlashingNode] = useState(null);
  const [objectFilter, setObjectFilter] = useState('');
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [lastAutoSave, setLastAutoSave] = useState(null);
  const [showAutoSaveIndicator, setShowAutoSaveIndicator] = useState(false);

  const svgRef = useRef(null);
  const nextId = useRef(1);
  const autoSaveIntervalRef = useRef(null);
  const flashTimeoutRef = useRef(null);

  // === Undo / Redo system ===
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const isUndoRedo = useRef(false);
  const maxHistory = 50;

  const takeSnapshot = useCallback(() => {
    return {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
      phases: JSON.parse(JSON.stringify(phases)),
      objects: JSON.parse(JSON.stringify(objects)),
      nextId: nextId.current,
    };
  }, [nodes, edges, phases, objects]);

  const pushUndo = useCallback(() => {
    const snap = takeSnapshot();
    undoStack.current = [...undoStack.current.slice(-(maxHistory - 1)), snap];
    redoStack.current = [];
  }, [takeSnapshot]);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    // Save current state to redo stack
    const currentSnap = takeSnapshot();
    redoStack.current = [...redoStack.current, currentSnap];
    // Pop from undo stack
    const snap = undoStack.current[undoStack.current.length - 1];
    undoStack.current = undoStack.current.slice(0, -1);
    // Restore
    isUndoRedo.current = true;
    setNodes(snap.nodes);
    setEdges(snap.edges);
    setPhases(snap.phases);
    setObjects(snap.objects);
    nextId.current = snap.nextId;
    setSelectedNode(null);
    setSelectedEdge(null);
    setSelectedNodes(new Set());
  }, [takeSnapshot]);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    // Save current state to undo stack
    const currentSnap = takeSnapshot();
    undoStack.current = [...undoStack.current, currentSnap];
    // Pop from redo stack
    const snap = redoStack.current[redoStack.current.length - 1];
    redoStack.current = redoStack.current.slice(0, -1);
    // Restore
    isUndoRedo.current = true;
    setNodes(snap.nodes);
    setEdges(snap.edges);
    setPhases(snap.phases);
    setObjects(snap.objects);
    nextId.current = snap.nextId;
    setSelectedNode(null);
    setSelectedEdge(null);
    setSelectedNodes(new Set());
  }, [takeSnapshot]);

  const screenToWorld = useCallback((screenX, screenY) => {
    return {
      x: (screenX - viewport.x) / viewport.zoom,
      y: (screenY - viewport.y) / viewport.zoom
    };
  }, [viewport]);

  const getNodeCenter = (node) => ({
    x: node.x + 60,
    y: node.y + 30
  });

  const handleMouseMove = useCallback((e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const worldPos = screenToWorld(screenX, screenY);
    setMousePos(worldPos);

    if (draggingNode) {
      const node = nodes.find(n => n.id === draggingNode);
      if (node) {
        const displayLabel = node.label.replace(/^SU\s*/i, '');
        const nodeWidth = Math.max(50, displayLabel.length * 9 + 30);
        const nodeHeight = 28;
        setNodes(prev => prev.map(n =>
          n.id === draggingNode
            ? { ...n, x: worldPos.x - nodeWidth / 2, y: worldPos.y - nodeHeight / 2 }
            : n
        ));
      }
    }

    if (isPanning) {
      setViewport(prev => ({
        ...prev,
        x: prev.x + (e.clientX - panStart.x),
        y: prev.y + (e.clientY - panStart.y)
      }));
      setPanStart({ x: e.clientX, y: e.clientY });
    }

    if (selectionStart) {
      const x = Math.min(selectionStart.x, worldPos.x);
      const y = Math.min(selectionStart.y, worldPos.y);
      const width = Math.abs(worldPos.x - selectionStart.x);
      const height = Math.abs(worldPos.y - selectionStart.y);
      setSelectionRect({ x, y, width, height });
    }
  }, [draggingNode, isPanning, panStart, screenToWorld, selectionStart]);

  const handleMouseUp = useCallback(() => {
    if (selectionRect && selectionRect.width > 5 && selectionRect.height > 5) {
      // Find nodes inside selection rectangle
      const selected = new Set();
      nodes.forEach(node => {
        const displayLabel = node.label.replace(/^SU\s*/i, '');
        const nodeWidth = Math.max(50, displayLabel.length * 9 + 30);
        const nodeHeight = 28;
        const nodeCenter = { x: node.x + nodeWidth / 2, y: node.y + nodeHeight / 2 };
        if (
          nodeCenter.x >= selectionRect.x &&
          nodeCenter.x <= selectionRect.x + selectionRect.width &&
          nodeCenter.y >= selectionRect.y &&
          nodeCenter.y <= selectionRect.y + selectionRect.height
        ) {
          selected.add(node.id);
        }
      });
      setSelectedNodes(selected);
      setSelectedNode(null);
    }
    setSelectionRect(null);
    setSelectionStart(null);
    setDraggingNode(null);
    setIsPanning(false);
  }, [selectionRect, nodes]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.2, Math.min(3, viewport.zoom * zoomFactor));

    setViewport(prev => ({
      zoom: newZoom,
      x: mouseX - (mouseX - prev.x) * (newZoom / prev.zoom),
      y: mouseY - (mouseY - prev.y) * (newZoom / prev.zoom)
    }));
  }, [viewport.zoom]);

  const handleSvgMouseDown = useCallback((e) => {
    if (e.target === svgRef.current || e.target.classList.contains('background')) {
      if (e.ctrlKey || e.metaKey) {
        // Start rectangle selection
        const rect = svgRef.current.getBoundingClientRect();
        const worldPos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        setSelectionStart(worldPos);
        setSelectionRect({ x: worldPos.x, y: worldPos.y, width: 0, height: 0 });
      } else {
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
        setSelectedNode(null);
        setSelectedNodes(new Set());
        setSelectedEdge(null);
        setSelectedObject(null);
        setShowExportMenu(false);
      }
    }
  }, [screenToWorld]);

  const handleNodeMouseDown = useCallback((e, nodeId) => {
    e.stopPropagation();
    if (e.shiftKey) {
      // Start connecting
      setConnecting(nodeId);
    } else if (e.ctrlKey || e.metaKey) {
      // Toggle selection
      setSelectedNodes(prev => {
        const newSet = new Set(prev);
        if (newSet.has(nodeId)) {
          newSet.delete(nodeId);
        } else {
          newSet.add(nodeId);
        }
        return newSet;
      });
      setSelectedNode(null);
    } else {
      pushUndo(); // Capture state before drag
      setDraggingNode(nodeId);
      setSelectedNode(nodeId);
      setSelectedNodes(new Set());
      setSelectedEdge(null);
      
      // If the node belongs to an object, open Object Manager and select that object
      const nodeObjects = objects.filter(o => o.nodeIds.includes(nodeId));
      if (nodeObjects.length > 0) {
        setShowObjectManager(true);
        setSelectedObject(nodeObjects[0].id);
      }
    }
  }, [pushUndo, objects]);

  const handleNodeMouseUp = useCallback((e, nodeId) => {
    if (connecting && connecting !== nodeId) {
      // Check if edge already exists
      const edgeExists = edges.some(
        edge => (edge.source === connecting && edge.target === nodeId) ||
                (edge.source === nodeId && edge.target === connecting)
      );
      
      if (!edgeExists) {
        pushUndo();
        const newEdge = {
          id: `e${connecting}-${nodeId}`,
          source: connecting,
          target: nodeId
        };
        setEdges(prev => [...prev, newEdge]);
      }
    }
    setConnecting(null);
  }, [connecting, edges]);

  // Generate a unique label for a new node
  const generateUniqueLabel = useCallback(() => {
    const existingLabels = new Set(nodes.map(n => n.label.toLowerCase().trim()));
    let counter = nextId.current;
    let label;
    
    // Find a label that doesn't exist yet
    do {
      label = 'SU ' + String(counter).padStart(3, '0');
      counter++;
    } while (existingLabels.has(label.toLowerCase()));
    
    // Update nextId if we had to skip some numbers
    if (counter > nextId.current + 1) {
      nextId.current = counter - 1;
    }
    
    return label;
  }, [nodes]);

  // Check if a label already exists (for validation)
  const isLabelDuplicate = useCallback((label, excludeNodeId = null) => {
    const normalizedLabel = label.toLowerCase().trim();
    return nodes.some(n => 
      n.id !== excludeNodeId && 
      n.label.toLowerCase().trim() === normalizedLabel
    );
  }, [nodes]);

  const handleDoubleClick = useCallback((e) => {
    if (e.target === svgRef.current || e.target.classList.contains('background')) {
      const rect = svgRef.current.getBoundingClientRect();
      const worldPos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      
      pushUndo();
      const newNode = {
        id: String(nextId.current++),
        label: generateUniqueLabel(),
        description: '',
        type: 'layer',
        phase: '',
        x: worldPos.x - 25,
        y: worldPos.y - 14
      };
      setNodes(prev => [...prev, newNode]);
      setSelectedNode(newNode.id);
      setEditingNode(newNode.id);
    }
  }, [screenToWorld, generateUniqueLabel]);

  const handleEdgeClick = useCallback((e, edgeId) => {
    e.stopPropagation();
    setSelectedEdge(edgeId);
    setSelectedNode(null);
  }, []);

  const deleteSelected = useCallback(() => {
    const hasSelection = selectedNodes.size > 0 || selectedNode || selectedEdge;
    if (hasSelection) pushUndo();
    
    if (selectedNodes.size > 0) {
      setNodes(prev => prev.filter(n => !selectedNodes.has(n.id)));
      setEdges(prev => prev.filter(e => !selectedNodes.has(e.source) && !selectedNodes.has(e.target)));
      setSelectedNodes(new Set());
    } else if (selectedNode) {
      setNodes(prev => prev.filter(n => n.id !== selectedNode));
      setEdges(prev => prev.filter(e => e.source !== selectedNode && e.target !== selectedNode));
      setSelectedNode(null);
    }
    if (selectedEdge) {
      setEdges(prev => prev.filter(e => e.id !== selectedEdge));
      setSelectedEdge(null);
    }
  }, [selectedNode, selectedNodes, selectedEdge]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const activeElement = document.activeElement;
      const isInputActive = activeElement.tagName === 'INPUT' || 
                           activeElement.tagName === 'TEXTAREA';
      
      if (!isInputActive) {
        e.preventDefault(); // Prevent browser back navigation
        deleteSelected();
      }
    }
    if (e.key === 'Escape') {
      setConnecting(null);
      setEditingNode(null);
      setShowSearch(false);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      setShowSearch(true);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    }
  }, [deleteSelected, editingNode, undo, redo]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // === AutoSave System ===
  const AUTOSAVE_KEY = 'hme_autosave';
  const AUTOSAVE_INTERVAL = 30000; // 30 seconds
  
  // Save current state to localStorage
  const performAutoSave = useCallback(() => {
    if (nodes.length === 0 && edges.length === 0 && phases.length === 0 && objects.length === 0) {
      return; // Don't save empty state
    }
    
    const data = {
      version: '1.0',
      autoSaveDate: new Date().toISOString(),
      nodes: nodes,
      edges: edges,
      phases: phases,
      objects: objects,
      nextId: nextId.current
    };
    
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
      setLastAutoSave(new Date());
      setShowAutoSaveIndicator(true);
      setTimeout(() => setShowAutoSaveIndicator(false), 2000);
    } catch (err) {
      console.error('AutoSave failed:', err);
    }
  }, [nodes, edges, phases, objects]);
  
  // Load from localStorage on startup
  const hasPromptedRestore = useRef(false);
  useEffect(() => {
    if (hasPromptedRestore.current) return; // Prevent double prompt in StrictMode
    hasPromptedRestore.current = true;
    
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        // Only offer to restore if there's actual data
        if (data.nodes && data.nodes.length > 0) {
          const savedDate = new Date(data.autoSaveDate);
          const timeAgo = Math.round((Date.now() - savedDate.getTime()) / 60000);
          const timeStr = timeAgo < 60 ? `${timeAgo} minutes` : `${Math.round(timeAgo / 60)} hours`;
          
          if (window.confirm(`Found autosaved data from ${timeStr} ago (${data.nodes.length} units). Restore?`)) {
            setNodes(data.nodes || []);
            setEdges(data.edges || []);
            setPhases(data.phases || []);
            setObjects(data.objects || []);
            if (data.nextId) nextId.current = data.nextId;
          }
        }
      }
    } catch (err) {
      console.error('Failed to load autosave:', err);
    }
  }, []); // Only run once on mount
  
  // Set up autosave interval
  useEffect(() => {
    if (!autoSaveEnabled) {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
        autoSaveIntervalRef.current = null;
      }
      return;
    }
    
    autoSaveIntervalRef.current = setInterval(() => {
      performAutoSave();
    }, AUTOSAVE_INTERVAL);
    
    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
      }
    };
  }, [autoSaveEnabled, performAutoSave]);
  
  // Save before unload (browser close/refresh)
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (nodes.length > 0 || edges.length > 0) {
        performAutoSave();
        // Show confirmation dialog
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [nodes, edges, performAutoSave]);
  
  // Clear autosave data
  const clearAutoSave = useCallback(() => {
    localStorage.removeItem(AUTOSAVE_KEY);
    setLastAutoSave(null);
  }, []);

  const updateNodeLabel = (nodeId, newLabel) => {
    setNodes(prev => prev.map(n =>
      n.id === nodeId ? { ...n, label: newLabel } : n
    ));
  };

  // Capture state before editing begins (called on focus)
  const onFieldFocus = useCallback(() => {
    pushUndo();
  }, [pushUndo]);

  const updateNodeDescription = (nodeId, newDesc) => {
    setNodes(prev => prev.map(n =>
      n.id === nodeId ? { ...n, description: newDesc } : n
    ));
  };

  const performSearch = useCallback((term) => {
    if (!term.trim()) {
      setSearchResults([]);
      return;
    }
    const results = nodes.filter(n => 
      n.label.toLowerCase().includes(term.toLowerCase()) ||
      n.description.toLowerCase().includes(term.toLowerCase())
    );
    setSearchResults(results);
    setCurrentSearchIndex(0);
    if (results.length > 0) {
      navigateToNode(results[0]);
    }
  }, [nodes]);

  const navigateToNode = useCallback((node) => {
    setSelectedNode(node.id);
    setViewport(prev => ({
      x: -node.x * prev.zoom + 400,
      y: -node.y * prev.zoom + 300,
      zoom: prev.zoom
    }));
  }, []);

  // Ref to track return-pan timeout
  const returnPanTimeoutRef = useRef(null);

  // Highlight a node temporarily (flash effect) and pan to it
  const highlightAndPanToNode = useCallback((nodeId, doPan = true) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    // Clear any pending return-pan timeout
    if (returnPanTimeoutRef.current) {
      clearTimeout(returnPanTimeoutRef.current);
      returnPanTimeoutRef.current = null;
    }
    
    setHighlightedNode(nodeId);
    
    if (doPan) {
      // Pan to the highlighted node
      setViewport(prev => ({
        x: -node.x * prev.zoom + 400,
        y: -node.y * prev.zoom + 300,
        zoom: prev.zoom
      }));
    }
  }, [nodes]);

  // Clear highlight and return to selected node after delay
  const clearHighlightAndReturn = useCallback(() => {
    // Clear any pending timeout first
    if (returnPanTimeoutRef.current) {
      clearTimeout(returnPanTimeoutRef.current);
    }
    
    // Set timeout to return to selected node
    returnPanTimeoutRef.current = setTimeout(() => {
      setHighlightedNode(null);
      
      // Pan back to the selected node if one exists and start flash effect
      if (selectedNode) {
        const node = nodes.find(n => n.id === selectedNode);
        if (node) {
          // Calculate proper centering using node dimensions
          const displayLabel = node.label.replace(/^SU\s*/i, '');
          const nodeWidth = Math.max(50, displayLabel.length * 9 + 30);
          const nodeHeight = 28;
          const centerX = node.x + nodeWidth / 2;
          const centerY = node.y + nodeHeight / 2;
          
          // Get SVG container dimensions (approximate center point)
          const svgWidth = svgRef.current?.clientWidth || 800;
          const svgHeight = svgRef.current?.clientHeight || 600;
          
          setViewport(prev => ({
            x: -centerX * prev.zoom + svgWidth / 2,
            y: -centerY * prev.zoom + svgHeight / 2,
            zoom: prev.zoom
          }));
          
          // Start flash effect for 2 seconds
          setFlashingNode(selectedNode);
          if (flashTimeoutRef.current) {
            clearTimeout(flashTimeoutRef.current);
          }
          flashTimeoutRef.current = setTimeout(() => {
            setFlashingNode(null);
            flashTimeoutRef.current = null;
          }, 2000);
        }
      }
      returnPanTimeoutRef.current = null;
    }, 300); // Reduced initial delay for snappier response
  }, [selectedNode, nodes]);

  // Navigate to an object: pan and zoom to show all nodes of the object
  const navigateToObject = useCallback((objectId) => {
    const obj = objects.find(o => o.id === objectId);
    if (!obj) return;

    // Toggle expansion
    const isExpanding = selectedObject !== objectId;
    setSelectedObject(prev => prev === objectId ? null : objectId);
    
    // If collapsing, don't change anything else
    if (!isExpanding) return;
    
    // Check if user has a selection (for adding units to object)
    const hasSelection = selectedNodes.size > 0 || selectedNode;
    
    // If user has selection, keep it (they probably want to add units)
    if (hasSelection) {
      // Don't change selection, just expand the object
      return;
    }
    
    // If object has no nodes, nothing to zoom to
    if (obj.nodeIds.length === 0) {
      setSelectedNode(null);
      setSelectedNodes(new Set());
      return;
    }

    // Get all nodes belonging to this object
    const objectNodes = obj.nodeIds
      .map(id => nodes.find(n => n.id === id))
      .filter(Boolean);

    if (objectNodes.length === 0) {
      setSelectedNode(null);
      setSelectedNodes(new Set());
      return;
    }

    // Calculate bounding box of all object nodes
    const nodeHeight = 28;
    const getNodeWidth = (node) => {
      const displayLabel = node.label.replace(/^SU\s*/i, '');
      return Math.max(50, displayLabel.length * 9 + 30);
    };

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    objectNodes.forEach(node => {
      const w = getNodeWidth(node);
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x + w);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y + nodeHeight);
    });

    // Add padding around the bounding box
    const padding = 80;
    minX -= padding;
    maxX += padding;
    minY -= padding;
    maxY += padding;

    // Calculate center of bounding box
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Calculate zoom to fit all nodes (assuming 800x600 viewport area)
    const viewportWidth = 800;
    const viewportHeight = 600;
    const boxWidth = maxX - minX;
    const boxHeight = maxY - minY;
    const zoomX = viewportWidth / boxWidth;
    const zoomY = viewportHeight / boxHeight;
    const newZoom = Math.min(zoomX, zoomY, 2); // Cap at 2x zoom

    // Set viewport to center on the object
    setViewport({
      x: -centerX * newZoom + viewportWidth / 2,
      y: -centerY * newZoom + viewportHeight / 2,
      zoom: newZoom
    });

    // Select all nodes of the object
    setSelectedNode(null);
    setSelectedNodes(new Set(obj.nodeIds));
  }, [objects, nodes, selectedNodes, selectedNode, selectedObject]);

  const navigateSearchResult = useCallback((direction) => {
    if (searchResults.length === 0) return;
    const newIndex = (currentSearchIndex + direction + searchResults.length) % searchResults.length;
    setCurrentSearchIndex(newIndex);
    navigateToNode(searchResults[newIndex]);
  }, [searchResults, currentSearchIndex, navigateToNode]);

  const [exportModal, setExportModal] = useState({ show: false, content: '', filename: '' });

  const resetView = () => {
    setViewport({ x: 0, y: 0, zoom: 1 });
  };

  const exportData = () => {
    const data = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      nodes: nodes,
      edges: edges,
      phases: phases,
      objects: objects
    };
    setExportModal({
      show: true,
      content: JSON.stringify(data, null, 2),
      filename: 'harris-matrix.json',
      title: 'Save Matrix'
    });
  };

  const exportGeoJSON = () => {
    const features = nodes.map(node => {
      const nodeObjects = getObjectsForNode(node.id);
      const phaseInfo = phases.find(p => p.id === node.phase);
      return {
        type: 'Feature',
        properties: {
          id: node.id,
          label: node.label,
          description: node.description,
          type: node.type,
          phase: node.phase,
          phase_name: phaseInfo ? phaseInfo.name : null,
          phase_color: phaseInfo ? phaseInfo.color : null,
          object_ids: nodeObjects.map(o => o.id),
          object_names: nodeObjects.map(o => o.name),
          relations_above: edges.filter(e => e.target === node.id).map(e => {
            const sourceNode = nodes.find(n => n.id === e.source);
            return sourceNode ? sourceNode.label : e.source;
          }),
          relations_below: edges.filter(e => e.source === node.id).map(e => {
            const targetNode = nodes.find(n => n.id === e.target);
            return targetNode ? targetNode.label : e.target;
          })
        },
        geometry: node.geometry || null
      };
    });
    
    const geoJSON = {
      type: 'FeatureCollection',
      name: 'HarrisMatrix',
      features: features
    };
    
    setExportModal({
      show: true,
      content: JSON.stringify(geoJSON, null, 2),
      filename: 'harris-matrix.geojson',
      title: 'GeoJSON for QGIS'
    });
  };

  // === GeoJSON Import (from QGIS) ===
  const handleGeoJSONFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.type !== 'FeatureCollection' || !data.features) {
          alert('Invalid GeoJSON: Not a FeatureCollection');
          return;
        }
        const validFeatures = data.features.filter(f => f.geometry && f.properties);
        if (validFeatures.length === 0) {
          alert('No features with geometry found in GeoJSON');
          return;
        }
        // Collect all unique property keys across features
        const keySet = new Set();
        validFeatures.forEach(f => {
          Object.keys(f.properties).forEach(k => keySet.add(k));
        });
        const keys = [...keySet].sort();
        // Auto-detect likely match key
        const likelyKeys = ['label', 'SU_NR', 'su_nr', 'befund', 'Befund', 'BEFUND', 'unit', 'name', 'id', 'ID', 'Name', 'nummer', 'number'];
        const autoKey = likelyKeys.find(k => keys.includes(k)) || keys[0];
        // Build preview
        const preview = validFeatures.slice(0, 8).map(f => ({
          value: String(f.properties[autoKey] || ''),
          geomType: f.geometry.type,
          props: f.properties
        }));
        setGeoImportModal({
          show: true,
          features: validFeatures,
          attributeKeys: keys,
          selectedKey: autoKey,
          preview
        });
      } catch (err) {
        alert('Error reading GeoJSON: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const updateGeoImportPreview = (key) => {
    const preview = geoImportModal.features.slice(0, 8).map(f => ({
      value: String(f.properties[key] || ''),
      geomType: f.geometry.type,
    }));
    setGeoImportModal(prev => ({ ...prev, selectedKey: key, preview }));
  };

  const applyGeoImport = () => {
    const key = geoImportModal.selectedKey;
    const features = geoImportModal.features;
    let matched = 0;
    let unmatched = 0;
    pushUndo();
    setNodes(prev => prev.map(node => {
      // Try matching: exact label match, or numeric part match
      // IMPORTANT: IF (Interface) designations must be preserved as distinct units
      const nodeLabel = node.label.trim();
      
      // Extract normalized form: number + IF-flag
      // e.g., "SU 107IF" -> { num: "107", isIF: true }
      // e.g., "44-IF" -> { num: "44", isIF: true }
      // e.g., "IF65" -> { num: "65", isIF: true }
      const normalizeUnit = (str) => {
        const s = str.toUpperCase().replace(/[\s_-]/g, '');
        // Check for IF presence (prefix, suffix, or separated)
        const hasIF = /IF\d|\d+IF|^IF$/.test(s) || /IF/.test(str.toUpperCase().replace(/[\s_-]/g, ''));
        // More precise IF detection patterns:
        // - "IF65", "65IF", "SU107IF", "44-IF", "SU 107IF"
        const ifPattern = /(^IF\d)|(\d+IF$)|(-IF$)|(IF$)/i;
        const isIF = ifPattern.test(str.replace(/[\s_]/g, ''));
        const num = s.replace(/[^\d]/g, '');
        return { num, isIF };
      };
      
      const nodeNorm = normalizeUnit(nodeLabel);
      
      const feature = features.find(f => {
        const val = String(f.properties[key] || '').trim();
        // Exact match always wins
        if (val === nodeLabel) return true;
        
        const valNorm = normalizeUnit(val);
        
        // Both must have same IF status AND same number
        if (nodeNorm.num !== '' && valNorm.num === nodeNorm.num && valNorm.isIF === nodeNorm.isIF) return true;
        
        // Prefix-tolerant (e.g., "SU 001" matches "001" or "SU001") - but respect IF
        const nodeCompact = nodeLabel.replace(/[\s_-]/g, '').toLowerCase();
        const valCompact = val.replace(/[\s_-]/g, '').toLowerCase();
        if (valCompact === nodeCompact) return true;
        
        return false;
      });
      if (feature) {
        matched++;
        return { ...node, geometry: feature.geometry };
      }
      unmatched++;
      return node;
    }));
    setGeoImportModal({ show: false, features: [], attributeKeys: [], selectedKey: '', preview: [] });
    alert(`GeoJSON import: ${matched} matched, ${unmatched} unmatched of ${nodes.length} units`);
    // Reset map view to fit new geometries
    setMapViewBox(null);
  };

  // === Inline Map Panel (native React SVG) ===
  const [showMapPanel, setShowMapPanel] = useState(false);
  const [mapSelectedId, setMapSelectedId] = useState(null);
  const [mapViewBox, setMapViewBox] = useState(null);
  const mapSvgRef = useRef(null);
  const mapPanRef = useRef({ isPanning: false, start: { x: 0, y: 0 } });

  const geoNodes = useMemo(() => {
    return nodes.filter(n => n.geometry).map(n => {
      const phaseInfo = phases.find(p => p.id === n.phase);
      return {
        id: n.id,
        label: n.label,
        phaseColor: phaseInfo ? phaseInfo.color : '#666',
        geometry: n.geometry
      };
    });
  }, [nodes, phases]);

  // Sync selection from matrix to map
  useEffect(() => { setMapSelectedId(selectedNode); }, [selectedNode]);

  // Compute coordinate offset to keep SVG values small (precision-safe for UTM etc.)
  const mapOrigin = useMemo(() => {
    if (geoNodes.length === 0) return { x: 0, y: 0 };
    let x0 = Infinity, y0 = Infinity;
    geoNodes.forEach(n => {
      const cs = n.geometry.type === 'MultiPolygon'
        ? n.geometry.coordinates.flat(2)
        : n.geometry.coordinates.flat();
      cs.forEach(c => {
        if (Array.isArray(c) && c.length >= 2) {
          x0 = Math.min(x0, c[0]);
          y0 = Math.min(y0, c[1]);
        }
      });
    });
    return { x: x0, y: y0 };
  }, [geoNodes]);

  const getMapBBox = useCallback(() => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    geoNodes.forEach(n => {
      const cs = n.geometry.type === 'MultiPolygon'
        ? n.geometry.coordinates.flat(2)
        : n.geometry.coordinates.flat();
      cs.forEach(c => {
        if (Array.isArray(c) && c.length >= 2) {
          const rx = c[0] - mapOrigin.x;
          const ry = c[1] - mapOrigin.y;
          x0 = Math.min(x0, rx); x1 = Math.max(x1, rx);
          y0 = Math.min(y0, ry); y1 = Math.max(y1, ry);
        }
      });
    });
    const w = x1 - x0 || 1, h = y1 - y0 || 1;
    const pad = Math.max(w, h) * 0.08;
    return { x: x0 - pad, y: -(y1 + pad), w: w + pad * 2, h: h + pad * 2 };
  }, [geoNodes, mapOrigin]);

  const resetMapView = useCallback(() => {
    if (geoNodes.length > 0) setMapViewBox(getMapBBox());
  }, [geoNodes, getMapBBox]);

  useEffect(() => {
    if (showMapPanel && geoNodes.length > 0 && !mapViewBox) resetMapView();
  }, [showMapPanel, geoNodes, mapViewBox, resetMapView]);

  const geoToPath = useCallback((geometry) => {
    const rings = geometry.type === 'MultiPolygon'
      ? geometry.coordinates.flat()
      : geometry.coordinates;
    return rings.map(ring => {
      if (!Array.isArray(ring) || ring.length < 3) return '';
      return ring.map((c, i) => `${i === 0 ? 'M' : 'L'}${c[0] - mapOrigin.x} ${-(c[1] - mapOrigin.y)}`).join(' ') + 'Z';
    }).join(' ');
  }, [mapOrigin]);

  const geoCentroid = useCallback((geometry) => {
    const cs = geometry.type === 'MultiPolygon'
      ? geometry.coordinates.flat(2)
      : geometry.coordinates.flat();
    let sx = 0, sy = 0, n = 0;
    cs.forEach(c => { if (Array.isArray(c) && c.length >= 2) { sx += (c[0] - mapOrigin.x); sy += (c[1] - mapOrigin.y); n++; } });
    return n > 0 ? [sx / n, -sy / n] : [0, 0];
  }, [mapOrigin]);

  const handleMapWheel = useCallback((e) => {
    e.preventDefault();
    if (!mapViewBox) return;
    const svg = mapSvgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width * mapViewBox.w + mapViewBox.x;
    const my = (e.clientY - rect.top) / rect.height * mapViewBox.h + mapViewBox.y;
    const f = e.deltaY > 0 ? 1.1 : 0.9;
    setMapViewBox(prev => ({
      x: mx - (mx - prev.x) * f,
      y: my - (my - prev.y) * f,
      w: prev.w * f,
      h: prev.h * f
    }));
  }, [mapViewBox]);

  const handleMapMouseDown = useCallback((e) => {
    mapPanRef.current = { isPanning: true, start: { x: e.clientX, y: e.clientY } };
  }, []);

  const handleMapMouseMove = useCallback((e) => {
    if (!mapPanRef.current.isPanning || !mapViewBox) return;
    const svg = mapSvgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dx = (e.clientX - mapPanRef.current.start.x) / rect.width * mapViewBox.w;
    const dy = (e.clientY - mapPanRef.current.start.y) / rect.height * mapViewBox.h;
    setMapViewBox(prev => ({ ...prev, x: prev.x - dx, y: prev.y - dy }));
    mapPanRef.current.start = { x: e.clientX, y: e.clientY };
  }, [mapViewBox]);

  const handleMapMouseUp = useCallback(() => {
    mapPanRef.current.isPanning = false;
  }, []);

  const handleMapNodeClick = useCallback((nodeId) => {
    setMapSelectedId(nodeId);
    setSelectedNode(nodeId);
    setSelectedNodes(new Set());
    const node = nodes.find(n => n.id === nodeId);
    if (node) navigateToNode(node);
  }, [nodes, navigateToNode]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(exportModal.content);
      alert('Copied to clipboard!');
    } catch (err) {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = exportModal.content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      alert('Copied to clipboard!');
    }
  };

  const importData = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;
      
      if (file.name.endsWith('.graphml')) {
        importGraphML(content);
      } else {
        // JSON Import
        try {
          const data = JSON.parse(content);
          if (data.nodes && data.edges) {
            pushUndo();
            setNodes(data.nodes);
            setEdges(data.edges);
            if (data.phases) {
              setPhases(data.phases);
            }
            if (data.objects) {
              setObjects(data.objects);
            }
            nextId.current = Math.max(...data.nodes.map(n => parseInt(n.id) || 0)) + 1;
            resetView();
          }
        } catch (err) {
          alert('Import error: Invalid file format');
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // === GraphML Export (yEd-compatible) ===
  const exportGraphML = () => {
    const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    // Map our types to yEd shapes and colors
    const typeToYed = {
      layer:     { shape: 'rectangle',    fill: '#FEF3C7', border: '#D97706' },
      deposit:   { shape: 'rectangle',    fill: '#DBEAFE', border: '#2563EB' },
      fill:      { shape: 'trapezoid',    fill: '#FCE7F3', border: '#DB2777' },
      structure: { shape: 'hexagon',      fill: '#DCFCE7', border: '#16A34A' },
      interface: { shape: 'ellipse',      fill: '#E0E7FF', border: '#4F46E5' },
    };

    // Build lookup: nodeId -> [objectIds]
    const nodeObjectMap = {};
    objects.forEach(obj => {
      obj.nodeIds.forEach(id => {
        if (!nodeObjectMap[id]) nodeObjectMap[id] = [];
        nodeObjectMap[id].push(obj.id);
      });
    });

    // Build lookup: phaseId -> [objectIds in this phase]
    const phaseObjectMap = {};
    phases.forEach(p => { phaseObjectMap[p.id] = new Set(); });
    nodes.forEach(n => {
      if (n.phase && nodeObjectMap[n.id]) {
        if (phaseObjectMap[n.phase]) {
          nodeObjectMap[n.id].forEach(objId => phaseObjectMap[n.phase].add(objId));
        }
      }
    });

    // Generate a yEd ShapeNode XML for a node
    const renderShapeNode = (node, indent) => {
      const t = typeToYed[node.type] || typeToYed.deposit;
      const displayLabel = node.label;
      const w = Math.max(80, displayLabel.length * 8 + 40);
      const h = 40;
      const gmlId = node.graphmlId || `n${node.id}`;
      const lines = [];
      lines.push(`${indent}<node id="${esc(gmlId)}">`);
      lines.push(`${indent}  <data key="d_node">`);
      lines.push(`${indent}    <y:ShapeNode>`);
      lines.push(`${indent}      <y:Geometry height="${h}" width="${w}" x="${(node.x || 0) * 2}" y="${(node.y || 0) * 2}"/>`);
      lines.push(`${indent}      <y:Fill color="${t.fill}" transparent="false"/>`);
      lines.push(`${indent}      <y:BorderStyle color="${t.border}" type="line" width="1.5"/>`);
      lines.push(`${indent}      <y:NodeLabel alignment="center" autoSizePolicy="content" fontFamily="Dialog" fontSize="12" fontStyle="bold" hasBackgroundColor="false" hasLineColor="false" modelName="internal" modelPosition="c" textColor="#333333">${esc(displayLabel)}</y:NodeLabel>`);
      if (node.description) {
        lines.push(`${indent}      <y:NodeLabel alignment="center" autoSizePolicy="content" fontFamily="Dialog" fontSize="9" fontStyle="plain" hasBackgroundColor="false" hasLineColor="false" modelName="internal" modelPosition="b" textColor="#666666">${esc(node.description)}</y:NodeLabel>`);
      }
      lines.push(`${indent}      <y:Shape type="${t.shape}"/>`);
      lines.push(`${indent}    </y:ShapeNode>`);
      lines.push(`${indent}  </data>`);
      // Store HME metadata as custom data
      lines.push(`${indent}  <data key="d_hme_type">${esc(node.type)}</data>`);
      lines.push(`${indent}  <data key="d_hme_desc">${esc(node.description || '')}</data>`);
      lines.push(`${indent}</node>`);
      return lines.join('\n');
    };

    // Generate a yEd GroupNode XML
    const renderGroupOpen = (id, label, color, indent, isOpen = true) => {
      const lines = [];
      lines.push(`${indent}<node id="${esc(id)}" yfiles.foldertype="group">`);
      lines.push(`${indent}  <data key="d_node">`);
      lines.push(`${indent}    <y:ProxyAutoBoundsNode>`);
      lines.push(`${indent}      <y:Realizers active="0">`);
      lines.push(`${indent}        <y:GroupNode>`);
      lines.push(`${indent}          <y:Fill color="${color}40" transparent="false"/>`);
      lines.push(`${indent}          <y:BorderStyle color="${color}" type="dashed" width="2.0"/>`);
      lines.push(`${indent}          <y:NodeLabel alignment="center" autoSizePolicy="node_width" backgroundColor="${color}" fontFamily="Dialog" fontSize="13" fontStyle="bold" hasLineColor="false" modelName="internal" modelPosition="t" textColor="#FFFFFF">${esc(label)}</y:NodeLabel>`);
      lines.push(`${indent}          <y:Shape type="roundrectangle"/>`);
      lines.push(`${indent}          <y:State closed="false" closedHeight="50.0" closedWidth="100.0" innerGraphDisplayEnabled="false"/>`);
      lines.push(`${indent}        </y:GroupNode>`);
      lines.push(`${indent}      </y:Realizers>`);
      lines.push(`${indent}    </y:ProxyAutoBoundsNode>`);
      lines.push(`${indent}  </data>`);
      lines.push(`${indent}  <graph edgedefault="directed" id="${esc(id)}:">`);
      return lines.join('\n');
    };

    const renderGroupClose = (indent) => {
      return `${indent}  </graph>\n${indent}</node>`;
    };

    // Build XML
    const xml = [];
    xml.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
    xml.push('<graphml xmlns="http://graphml.graphdrawing.org/xmlns"');
    xml.push('  xmlns:java="http://www.yworks.com/xml/yfiles-common/1.0/java"');
    xml.push('  xmlns:sys="http://www.yworks.com/xml/yfiles-common/markup/primitives/2.0"');
    xml.push('  xmlns:x="http://www.yworks.com/xml/yfiles-common/markup/2.0"');
    xml.push('  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
    xml.push('  xmlns:y="http://www.yworks.com/xml/graphml"');
    xml.push('  xmlns:yed="http://www.yworks.com/xml/yed/3"');
    xml.push('  xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://www.yworks.com/xml/schema/graphml/1.1/ygraphml.xsd">');
    xml.push('  <key for="node" id="d_node" yfiles.type="nodegraphics"/>');
    xml.push('  <key for="edge" id="d_edge" yfiles.type="edgegraphics"/>');
    xml.push('  <key attr.name="description" attr.type="string" for="edge" id="d_edge_desc"/>');
    xml.push('  <key attr.name="hme_type" attr.type="string" for="node" id="d_hme_type"/>');
    xml.push('  <key attr.name="hme_description" attr.type="string" for="node" id="d_hme_desc"/>');
    xml.push('  <graph edgedefault="directed" id="G">');

    // Track which nodes have been rendered (to avoid duplicates)
    const renderedNodeIds = new Set();
    let groupCounter = 1;

    // Render phases as top-level groups
    phases.forEach(phase => {
      const phaseNodes = nodes.filter(n => n.phase === phase.id);
      if (phaseNodes.length === 0) return;

      const phaseGroupId = `phase_${phase.id}`;
      xml.push(renderGroupOpen(phaseGroupId, phase.name, phase.color, '    '));

      // Find objects in this phase
      const objIdsInPhase = phaseObjectMap[phase.id] || new Set();

      // Render object sub-groups
      objIdsInPhase.forEach(objId => {
        const obj = objects.find(o => o.id === objId);
        if (!obj) return;

        const objNodesInPhase = phaseNodes.filter(n => obj.nodeIds.includes(n.id));
        if (objNodesInPhase.length === 0) return;

        const objGroupId = `obj_${phase.id}_${obj.id}`;
        xml.push(renderGroupOpen(objGroupId, obj.name, obj.color, '        '));

        objNodesInPhase.forEach(node => {
          xml.push(renderShapeNode(node, '            '));
          renderedNodeIds.add(node.id);
        });

        xml.push(renderGroupClose('        '));
      });

      // Render loose nodes (in phase but not in any object)
      phaseNodes.forEach(node => {
        if (!renderedNodeIds.has(node.id)) {
          xml.push(renderShapeNode(node, '        '));
          renderedNodeIds.add(node.id);
        }
      });

      xml.push(renderGroupClose('    '));
    });

    // Render nodes without phase (ungrouped)
    nodes.forEach(node => {
      if (!renderedNodeIds.has(node.id)) {
        xml.push(renderShapeNode(node, '    '));
        renderedNodeIds.add(node.id);
      }
    });

    // Render edges
    edges.forEach((edge, idx) => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      if (!sourceNode || !targetNode) return;

      const srcGmlId = sourceNode.graphmlId || `n${sourceNode.id}`;
      const tgtGmlId = targetNode.graphmlId || `n${targetNode.id}`;
      const edgeLabel = `${sourceNode.label} → ${targetNode.label}`;

      xml.push(`    <edge id="e${idx + 1}" source="${esc(srcGmlId)}" target="${esc(tgtGmlId)}">`);
      xml.push(`      <data key="d_edge">`);
      xml.push(`        <y:PolyLineEdge>`);
      xml.push(`          <y:LineStyle color="#666666" type="line" width="1.0"/>`);
      xml.push(`          <y:Arrows source="none" target="standard"/>`);
      xml.push(`          <y:EdgeLabel alignment="center" distance="2.0" fontFamily="Dialog" fontSize="9" fontStyle="plain" hasBackgroundColor="false" hasLineColor="false" modelName="six_pos" modelPosition="tail" textColor="#999999">${esc(edgeLabel)}</y:EdgeLabel>`);
      xml.push(`        </y:PolyLineEdge>`);
      xml.push(`      </data>`);
      xml.push(`    </edge>`);
    });

    xml.push('  </graph>');
    xml.push('</graphml>');

    setExportModal({
      show: true,
      content: xml.join('\n'),
      filename: 'harris-matrix.graphml',
      title: 'GraphML for yEd'
    });
  };

  // === SVG Export ===
  const exportSVG = () => {
    if (!svgRef.current) return;

    const nodeHeight = 28;
    const padding = 40;

    // Compute bounding box of all content
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(node => {
      const displayLabel = node.label.replace(/^SU\s*/i, '');
      const nodeWidth = Math.max(50, displayLabel.length * 9 + 30);
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + nodeWidth);
      maxY = Math.max(maxY, node.y + nodeHeight);
    });
    // Include object hulls / phase strips
    minX = Math.min(minX, 10) - padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const width = maxX - minX;
    const height = maxY - minY;

    const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    const svg = [];
    svg.push(`<?xml version="1.0" encoding="UTF-8" standalone="no"?>`);
    svg.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">`);
    svg.push(`  <style>`);
    svg.push(`    text { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }`);
    svg.push(`    .node-label { font-size: 12px; font-weight: bold; fill: #333; }`);
    svg.push(`    .type-symbol { font-size: 12px; }`);
    svg.push(`    .phase-label { font-size: 10px; font-weight: bold; fill: white; }`);
    svg.push(`    .object-label { font-size: 11px; font-weight: bold; }`);
    svg.push(`    .edge-line { fill: none; stroke: #666; stroke-width: 1; }`);
    svg.push(`    .arrow { fill: #666; }`);
    svg.push(`  </style>`);
    svg.push(`  <rect width="100%" height="100%" fill="#f5f5f5"/>`);

    // Phase strips
    const phaseRanges = {};
    nodes.forEach(node => {
      if (node.phase) {
        if (!phaseRanges[node.phase]) phaseRanges[node.phase] = { minY: Infinity, maxY: -Infinity };
        phaseRanges[node.phase].minY = Math.min(phaseRanges[node.phase].minY, node.y);
        phaseRanges[node.phase].maxY = Math.max(phaseRanges[node.phase].maxY, node.y + nodeHeight);
      }
    });

    phases.forEach(phase => {
      const range = phaseRanges[phase.id];
      if (!range || range.minY === Infinity) return;
      const stripW = 25, stripX = 10, pad = 15;
      svg.push(`  <rect x="${stripX}" y="${range.minY - pad}" width="${stripW}" height="${range.maxY - range.minY + pad * 2}" fill="${phase.color}" opacity="0.8" rx="3"/>`);
      const cy = range.minY + (range.maxY - range.minY) / 2;
      const cx = stripX + stripW / 2;
      svg.push(`  <text x="${cx}" y="${cy}" text-anchor="middle" class="phase-label" transform="rotate(-90, ${cx}, ${cy})">${esc(phase.name.length > 20 ? phase.name.slice(0, 20) + '...' : phase.name)}</text>`);
    });

    // Object hulls
    objects.forEach(obj => {
      const objNodes = obj.nodeIds.map(id => nodes.find(n => n.id === id)).filter(Boolean);
      if (objNodes.length === 0) return;

      const hullPadding = 12;
      const points = [];
      objNodes.forEach(node => {
        const dl = node.label.replace(/^SU\s*/i, '');
        const w = Math.max(50, dl.length * 9 + 30);
        points.push({ x: node.x - hullPadding, y: node.y - hullPadding });
        points.push({ x: node.x + w + hullPadding, y: node.y - hullPadding });
        points.push({ x: node.x + w + hullPadding, y: node.y + nodeHeight + hullPadding });
        points.push({ x: node.x - hullPadding, y: node.y + nodeHeight + hullPadding });
      });

      // Convex hull (Graham scan)
      const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
      const sorted = [...points].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
      const lower = [];
      for (const p of sorted) { while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) lower.pop(); lower.push(p); }
      const upper = [];
      for (let i = sorted.length - 1; i >= 0; i--) { const p = sorted[i]; while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0) upper.pop(); upper.push(p); }
      lower.pop(); upper.pop();
      const hull = [...lower, ...upper];
      if (hull.length < 3) return;

      const pathD = hull.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
      svg.push(`  <path d="${pathD}" fill="${obj.color}" fill-opacity="0.08" stroke="#555" stroke-width="1.5" stroke-dasharray="6,3" stroke-linejoin="round"/>`);
      svg.push(`  <text x="${Math.min(...hull.map(p=>p.x)) + 5}" y="${Math.min(...hull.map(p=>p.y)) - 5}" class="object-label" fill="#555">${esc(obj.name)}</text>`);
    });

    // Edges
    edges.forEach(edge => {
      const sn = nodes.find(n => n.id === edge.source);
      const tn = nodes.find(n => n.id === edge.target);
      if (!sn || !tn) return;

      const sl = sn.label.replace(/^SU\s*/i, '');
      const tl = tn.label.replace(/^SU\s*/i, '');
      const sw = Math.max(50, sl.length * 9 + 30);
      const tw = Math.max(50, tl.length * 9 + 30);

      const sx = sn.x + sw / 2, sy = sn.y + nodeHeight;
      const ex = tn.x + tw / 2, ey = tn.y;
      const my = sy + (ey - sy) / 2;
      const needsDetour = Math.abs(sx - ex) > 5;

      const pathD = needsDetour
        ? `M ${sx} ${sy} L ${sx} ${my} L ${ex} ${my} L ${ex} ${ey}`
        : `M ${sx} ${sy} L ${ex} ${ey}`;

      svg.push(`  <path d="${pathD}" class="edge-line"/>`);
      const as = 5;
      svg.push(`  <polygon points="${ex},${ey} ${ex-as},${ey-as*1.5} ${ex+as},${ey-as*1.5}" class="arrow"/>`);
    });

    // Nodes
    nodes.forEach(node => {
      const typeStyle = nodeTypees[node.type] || nodeTypees.layer;
      const isCircle = typeStyle.shape === 'circle';
      const displayLabel = node.label.replace(/^SU\s*/i, '');
      const nodeWidth = Math.max(50, displayLabel.length * 9 + 30);

      if (isCircle) {
        svg.push(`  <ellipse cx="${node.x + nodeWidth/2}" cy="${node.y + nodeHeight/2}" rx="${nodeWidth/2}" ry="${nodeHeight/2}" fill="${typeStyle.color}" stroke="${typeStyle.border}" stroke-width="1.5"/>`);
      } else {
        svg.push(`  <rect x="${node.x}" y="${node.y}" width="${nodeWidth}" height="${nodeHeight}" rx="3" fill="${typeStyle.color}" stroke="${typeStyle.border}" stroke-width="1.5"/>`);
      }
      svg.push(`  <text x="${node.x + 8}" y="${node.y + nodeHeight/2 + 4}" class="type-symbol" fill="${typeStyle.border}">${esc(typeStyle.symbol)}</text>`);
      svg.push(`  <text x="${node.x + nodeWidth/2 + 6}" y="${node.y + nodeHeight/2 + 4}" text-anchor="middle" class="node-label">${esc(displayLabel)}</text>`);
    });

    svg.push('</svg>');

    setExportModal({
      show: true,
      content: svg.join('\n'),
      filename: 'harris-matrix.svg',
      title: 'SVG Export'
    });
  };

  // === GraphML Import (improved yEd support) ===
  const importGraphML = (xmlContent) => {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

      // Check for parse errors
      const parseError = xmlDoc.querySelector('parsererror');
      if (parseError) throw new Error('Invalid XML: ' + parseError.textContent.slice(0, 100));

      // Discover data key mappings (yEd uses dynamic key IDs)
      const keyMap = {};
      xmlDoc.querySelectorAll('key').forEach(k => {
        const forAttr = k.getAttribute('for');
        const yType = k.getAttribute('yfiles.type');
        const attrName = k.getAttribute('attr.name');
        if (yType === 'nodegraphics') keyMap.nodeGraphics = k.getAttribute('id');
        if (yType === 'edgegraphics') keyMap.edgeGraphics = k.getAttribute('id');
        if (attrName === 'hme_type') keyMap.hmeType = k.getAttribute('id');
        if (attrName === 'hme_description') keyMap.hmeDesc = k.getAttribute('id');
      });

      const importedNodes = [];
      const importedEdges = [];
      const importedPhases = [];
      const importedObjects = [];
      const nodeIdMap = {}; // graphmlId -> our internal id
      let nodeCounter = 1;
      let phaseCounter = 1;
      let objectCounter = 1;

      const phaseColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'];
      const objectColors = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#84cc16'];

      // Helper: extract label text from a node element (searches y:ShapeNode or y:GroupNode)
      const extractLabel = (el) => {
        const labels = el.getElementsByTagName('y:NodeLabel');
        if (labels.length > 0) return labels[0].textContent.trim();
        return null;
      };

      // Helper: extract second label as description
      const extractDescription = (el) => {
        const labels = el.getElementsByTagName('y:NodeLabel');
        if (labels.length > 1) return labels[1].textContent.trim();
        return '';
      };

      // Helper: extract fill color
      const extractFillColor = (el) => {
        const fill = el.getElementsByTagName('y:Fill')[0];
        return fill ? fill.getAttribute('color') : null;
      };

      // Helper: extract border color
      const extractBorderColor = (el) => {
        const border = el.getElementsByTagName('y:BorderStyle')[0];
        return border ? border.getAttribute('color') : null;
      };

      // Helper: detect node type from shape, color, label, and HME metadata
      const detectNodeType = (nodeElement, shapeType, fillColor, label) => {
        // 1. Check for HME custom data first (roundtrip)
        if (keyMap.hmeType) {
          const dataEls = nodeElement.getElementsByTagName('data');
          for (const d of dataEls) {
            if (d.getAttribute('key') === keyMap.hmeType) {
              const val = d.textContent.trim();
              if (['layer','deposit','fill','structure','interface'].includes(val)) return val;
            }
          }
        }

        // 2. Shape-based detection
        if (shapeType === 'ellipse') return 'interface';
        if (shapeType === 'trapezoid') return 'fill';
        if (shapeType === 'hexagon') return 'structure';

        // 3. Color-based detection (match our export colors)
        if (fillColor) {
          const c = fillColor.toUpperCase();
          if (c === '#FEF3C7' || c === '#FFFBEB') return 'layer';
          if (c === '#DBEAFE' || c === '#EFF6FF') return 'deposit';
          if (c === '#FCE7F3' || c === '#FDF2F8') return 'fill';
          if (c === '#DCFCE7' || c === '#F0FDF4') return 'structure';
          if (c === '#E0E7FF' || c === '#EEF2FF' || c === '#DCDCDC') return 'interface';
        }

        // 4. Label-based detection
        if (label) {
          const upper = label.toUpperCase();
          if (upper.startsWith('IF ') || upper.includes(' IF ') || upper === 'IF') return 'interface';
        }

        return 'deposit'; // default
      };

      // Helper: extract HME description from custom data
      const extractHmeDescription = (nodeElement) => {
        if (!keyMap.hmeDesc) return '';
        const dataEls = nodeElement.getElementsByTagName('data');
        for (const d of dataEls) {
          if (d.getAttribute('key') === keyMap.hmeDesc) return d.textContent.trim();
        }
        return '';
      };

      // Recursive node processor
      const processNode = (nodeElement, parentPhaseId = null, parentObjectId = null) => {
        const graphmlId = nodeElement.getAttribute('id');
        const isGroup = nodeElement.getAttribute('yfiles.foldertype') === 'group';

        // Get the visual data element
        const dataElements = nodeElement.getElementsByTagName('data');
        let visualElement = null; // The y:ShapeNode, y:GroupNode, or y:ProxyAutoBoundsNode
        for (const d of dataElements) {
          if (d.getAttribute('key') === keyMap.nodeGraphics || d.getAttribute('key') === 'd6' || d.getAttribute('key') === 'd_node') {
            visualElement = d;
            break;
          }
          // Fallback: any data element containing a y: visual element
          if (d.getElementsByTagName('y:ShapeNode').length > 0 ||
              d.getElementsByTagName('y:GroupNode').length > 0 ||
              d.getElementsByTagName('y:ProxyAutoBoundsNode').length > 0) {
            visualElement = d;
            break;
          }
        }

        if (isGroup) {
          // Determine if this is a phase group or an object group
          const label = visualElement ? extractLabel(visualElement) : `Group ${graphmlId}`;
          const fillColor = visualElement ? extractFillColor(visualElement) : null;
          const borderColor = visualElement ? extractBorderColor(visualElement) : null;
          const groupColor = borderColor || fillColor;

          let assignedPhaseId = parentPhaseId;
          let assignedObjectId = parentObjectId;

          if (!parentPhaseId) {
            // Top-level group = Phase
            const phaseId = String(phaseCounter);
            importedPhases.push({
              id: phaseId,
              name: label || `Phase ${phaseCounter}`,
              color: groupColor || phaseColors[(phaseCounter - 1) % phaseColors.length]
            });
            assignedPhaseId = phaseId;
            phaseCounter++;
          } else {
            // Nested group inside a phase = Object
            const objId = String(objectCounter + 1000); // offset to avoid collision with phase IDs
            importedObjects.push({
              id: objId,
              name: label || `Object ${objectCounter}`,
              color: groupColor || objectColors[(objectCounter - 1) % objectColors.length],
              nodeIds: [] // will be populated as child nodes are processed
            });
            assignedObjectId = objId;
            objectCounter++;
          }

          // Process nested graph
          const nestedGraphs = nodeElement.getElementsByTagName('graph');
          for (const ng of nestedGraphs) {
            // Only process direct child graph (not deeply nested ones)
            if (ng.parentElement === nodeElement) {
              for (const child of ng.children) {
                if (child.tagName === 'node') {
                  processNode(child, assignedPhaseId, assignedObjectId);
                }
              }
            }
          }
        } else {
          // Regular node (ShapeNode)
          const shapeNode = visualElement
            ? (visualElement.getElementsByTagName('y:ShapeNode')[0] || visualElement)
            : null;

          const geometry = shapeNode ? shapeNode.getElementsByTagName('y:Geometry')[0] : null;
          const shape = shapeNode ? shapeNode.getElementsByTagName('y:Shape')[0] : null;
          const label = shapeNode ? extractLabel(shapeNode) : `SU ${String(nodeCounter).padStart(3, '0')}`;
          const fillColor = shapeNode ? extractFillColor(shapeNode) : null;
          const shapeType = shape ? shape.getAttribute('type') : 'rectangle';
          const description = (shapeNode ? extractDescription(shapeNode) : '') || extractHmeDescription(nodeElement);

          const x = geometry ? parseFloat(geometry.getAttribute('x')) || 0 : 0;
          const y = geometry ? parseFloat(geometry.getAttribute('y')) || 0 : 0;

          const nodeType = detectNodeType(nodeElement, shapeType, fillColor, label);

          const nodeId = String(nodeCounter);
          nodeIdMap[graphmlId] = nodeId;

          // Ensure label has SU prefix
          let finalLabel = label;
          if (!finalLabel.toUpperCase().startsWith('SU')) {
            finalLabel = `SU ${finalLabel}`;
          }

          importedNodes.push({
            id: nodeId,
            graphmlId: graphmlId, // preserve for roundtrip
            label: finalLabel,
            description: description,
            type: nodeType,
            phase: parentPhaseId || '',
            x: x, // will be scaled later
            y: y
          });

          // If inside an object group, add to that object
          if (parentObjectId) {
            const obj = importedObjects.find(o => o.id === parentObjectId);
            if (obj) obj.nodeIds.push(nodeId);
          }

          nodeCounter++;
        }
      };

      // Process all top-level elements in the main graph
      const mainGraph = xmlDoc.getElementsByTagName('graph')[0];
      if (!mainGraph) throw new Error('No <graph> element found in GraphML file');

      for (const child of mainGraph.children) {
        if (child.tagName === 'node') {
          processNode(child);
        }
      }

      // Process edges (including those nested in group graphs)
      const allEdges = xmlDoc.getElementsByTagName('edge');
      let edgeCounter = 1;
      for (const edge of allEdges) {
        const sourceId = edge.getAttribute('source');
        const targetId = edge.getAttribute('target');
        const mappedSource = nodeIdMap[sourceId];
        const mappedTarget = nodeIdMap[targetId];

        if (mappedSource && mappedTarget) {
          importedEdges.push({
            id: `e${edgeCounter}`,
            source: mappedSource,
            target: mappedTarget
          });
          edgeCounter++;
        }
      }

      // Dynamic coordinate scaling: fit to a reasonable canvas size
      if (importedNodes.length > 0) {
        const xs = importedNodes.map(n => n.x);
        const ys = importedNodes.map(n => n.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xs);
        const maxY = Math.max(...ys);
        const rangeX = maxX - minX || 1;
        const rangeY = maxY - minY || 1;

        // Target: fit into roughly 800x800 canvas
        const targetSize = 800;
        const scale = Math.min(targetSize / rangeX, targetSize / rangeY, 1);

        importedNodes.forEach(n => {
          n.x = (n.x - minX) * scale + 60;
          n.y = (n.y - minY) * scale + 60;
        });
      }

      // Set imported data
      pushUndo();
      setNodes(importedNodes);
      setEdges(importedEdges);
      if (importedPhases.length > 0) setPhases(importedPhases);
      if (importedObjects.length > 0) setObjects(importedObjects);
      nextId.current = nodeCounter;
      resetView();

      const summary = [
        `${importedNodes.length} Units`,
        `${importedEdges.length} Relations`,
        importedPhases.length > 0 ? `${importedPhases.length} Phases` : null,
        importedObjects.length > 0 ? `${importedObjects.length} Objects` : null,
      ].filter(Boolean).join(', ');

      alert(`GraphML import successful: ${summary}`);

    } catch (err) {
      console.error('GraphML Import Error:', err);
      alert('Error importing GraphML file: ' + err.message);
    }
  };

  const updateNodeTypee = (nodeId, newTypee) => {
    pushUndo();
    setNodes(prev => prev.map(n =>
      n.id === nodeId ? { ...n, type: newTypee } : n
    ));
  };

  const updateNodePhase = (nodeId, newPhase) => {
    pushUndo();
    setNodes(prev => prev.map(n =>
      n.id === nodeId ? { ...n, phase: newPhase } : n
    ));
  };

  const getAllPhases = () => {
    return phases;
  };

  const addPhase = () => {
    pushUndo();
    const newId = String(phases.length + 1);
    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'];
    setPhases(prev => [...prev, {
      id: newId,
      name: `Phase ${newId}`,
      color: colors[phases.length % colors.length]
    }]);
  };

  const updatePhaseName = (phaseId, newName) => {
    setPhases(prev => prev.map(p =>
      p.id === phaseId ? { ...p, name: newName } : p
    ));
  };

  const updatePhaseColor = (phaseId, newColor) => {
    setPhases(prev => prev.map(p =>
      p.id === phaseId ? { ...p, color: newColor } : p
    ));
  };

  const deletePhase = (phaseId) => {
    pushUndo();
    setPhases(prev => prev.filter(p => p.id !== phaseId));
    setNodes(prev => prev.map(n =>
      n.phase === phaseId ? { ...n, phase: '' } : n
    ));
  };

  const reorderPhases = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    pushUndo();
    setPhases(prev => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  };

  const assignPhaseToSelected = (phaseId) => {
    pushUndo();
    if (selectedNodes.size > 0) {
      setNodes(prev => prev.map(n =>
        selectedNodes.has(n.id) ? { ...n, phase: phaseId } : n
      ));
    } else if (selectedNode) {
      setNodes(prev => prev.map(n =>
        n.id === selectedNode ? { ...n, phase: phaseId } : n
      ));
    }
  };

  const getPhaseById = (phaseId) => {
    return phases.find(p => p.id === phaseId);
  };

  // Calculate Y ranges for each phase (for phase strips)
  const getPhaseYRanges = () => {
    const ranges = {};
    const nodeHeight = 28;
    
    nodes.forEach(node => {
      if (node.phase) {
        if (!ranges[node.phase]) {
          ranges[node.phase] = { minY: Infinity, maxY: -Infinity };
        }
        ranges[node.phase].minY = Math.min(ranges[node.phase].minY, node.y);
        ranges[node.phase].maxY = Math.max(ranges[node.phase].maxY, node.y + nodeHeight);
      }
    });
    
    return ranges;
  };

  // Object Management Functions
  const addObject = () => {
    pushUndo();
    const newId = String(Date.now());
    const colors = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#84cc16'];
    setObjects(prev => [...prev, {
      id: newId,
      name: `Object ${objects.length + 1}`,
      color: colors[objects.length % colors.length],
      nodeIds: []
    }]);
    // Auto-expand the new object so user can immediately add units
    setSelectedObject(newId);
  };

  const updateObjectName = (objectId, newName) => {
    setObjects(prev => prev.map(o =>
      o.id === objectId ? { ...o, name: newName } : o
    ));
  };

  const updateObjectColor = (objectId, newColor) => {
    setObjects(prev => prev.map(o =>
      o.id === objectId ? { ...o, color: newColor } : o
    ));
  };

  const deleteObject = (objectId) => {
    pushUndo();
    setObjects(prev => prev.filter(o => o.id !== objectId));
    if (selectedObject === objectId) {
      setSelectedObject(null);
    }
  };

  const addNodesToObject = (objectId) => {
    const nodesToAdd = selectedNodes.size > 0 
      ? Array.from(selectedNodes) 
      : (selectedNode ? [selectedNode] : []);
    
    if (nodesToAdd.length === 0) return;

    pushUndo();
    setObjects(prev => prev.map(o => {
      if (o.id === objectId) {
        const newNodeIds = [...new Set([...o.nodeIds, ...nodesToAdd])];
        return { ...o, nodeIds: newNodeIds };
      }
      return o;
    }));
  };

  const removeNodeFromObject = (objectId, nodeId) => {
    pushUndo();
    setObjects(prev => prev.map(o => {
      if (o.id === objectId) {
        return { ...o, nodeIds: o.nodeIds.filter(id => id !== nodeId) };
      }
      return o;
    }));
  };

  const getObjectsForNode = (nodeId) => {
    return objects.filter(o => o.nodeIds.includes(nodeId));
  };

  const selectObjectNodes = (objectId) => {
    const obj = objects.find(o => o.id === objectId);
    if (obj) {
      setSelectedNodes(new Set(obj.nodeIds));
      setSelectedNode(null);
    }
  };

  const autoLayoutByPhase = () => {
    pushUndo();
    const sortedPhases = [...phases];
    
    const nodeHeight = 28;
    const { horizontalGap, verticalGap, phaseGap } = layoutSettings;
    const objectGap = horizontalGap * 3;
    const startY = 50;

    const getNodeWidth = (node) => {
      const displayLabel = node.label.replace(/^SU\s*/i, '');
      return Math.max(50, displayLabel.length * 9 + 30);
    };

    // Lookup: nodeId -> [objectIds] (multi-object support)
    const nodeObjectMap = {};
    objects.forEach(obj => {
      obj.nodeIds.forEach(id => {
        if (!nodeObjectMap[id]) nodeObjectMap[id] = [];
        nodeObjectMap[id].push(obj.id);
      });
    });

    // === Step 1: Topological ranks within each phase ===
    const phaseRanks = {};

    sortedPhases.forEach(phase => {
      const phaseNodeIds = new Set(nodes.filter(n => n.phase === phase.id).map(n => n.id));
      if (phaseNodeIds.size === 0) return;

      const internalEdges = edges.filter(e => phaseNodeIds.has(e.source) && phaseNodeIds.has(e.target));
      const inDegree = {};
      phaseNodeIds.forEach(id => { inDegree[id] = 0; });
      internalEdges.forEach(e => { inDegree[e.target] = (inDegree[e.target] || 0) + 1; });

      const rank = {};
      phaseNodeIds.forEach(id => { rank[id] = 0; });

      const adj = {};
      phaseNodeIds.forEach(id => { adj[id] = []; });
      internalEdges.forEach(e => { adj[e.source].push(e.target); });

      const queue = [];
      phaseNodeIds.forEach(id => { if (inDegree[id] === 0) queue.push(id); });

      while (queue.length > 0) {
        const current = queue.shift();
        adj[current].forEach(target => {
          rank[target] = Math.max(rank[target], rank[current] + 1);
          inDegree[target]--;
          if (inDegree[target] === 0) queue.push(target);
        });
      }

      phaseRanks[phase.id] = rank;
    });

    // Nodes without phase
    const noPhaseNodeIds = new Set(
      nodes.filter(n => !n.phase || !phases.some(p => p.id === n.phase)).map(n => n.id)
    );
    if (noPhaseNodeIds.size > 0) {
      const rank = {};
      noPhaseNodeIds.forEach(id => { rank[id] = 0; });
      phaseRanks['__none__'] = rank;
    }

    // === Step 2: Build columns per phase (structural, doesn't change) ===
    const allPhaseIds = [...sortedPhases.map(p => p.id)];
    if (phaseRanks['__none__']) allPhaseIds.push('__none__');

    const phaseColumnData = {};

    allPhaseIds.forEach(phaseId => {
      const ranks = phaseRanks[phaseId];
      if (!ranks) return;

      const phaseNodeIds = Object.keys(ranks);
      const maxRank = Math.max(0, ...Object.values(ranks));

      const phaseObjectIds = new Set();
      const looseNodeIds = [];

      phaseNodeIds.forEach(id => {
        const objIds = nodeObjectMap[id];
        if (objIds && objIds.length > 0) {
          // Use the first object for layout grouping
          phaseObjectIds.add(objIds[0]);
        } else {
          looseNodeIds.push(id);
        }
      });

      looseNodeIds.sort((a, b) => {
        const na = nodes.find(n => n.id === a);
        const nb = nodes.find(n => n.id === b);
        return (na?.label || '').localeCompare(nb?.label || '');
      });

      const columns = [];

      // Object columns sorted by smallest node label
      const sortedObjIds = [...phaseObjectIds].sort((a, b) => {
        const objA = objects.find(o => o.id === a);
        const objB = objects.find(o => o.id === b);
        const minA = objA.nodeIds.map(id => nodes.find(n => n.id === id)).filter(Boolean).map(n => n.label).sort()[0] || '';
        const minB = objB.nodeIds.map(id => nodes.find(n => n.id === id)).filter(Boolean).map(n => n.label).sort()[0] || '';
        return minA.localeCompare(minB);
      });

      sortedObjIds.forEach(objId => {
        const obj = objects.find(o => o.id === objId);
        const objPhaseNodeIds = obj.nodeIds.filter(id => ranks[id] !== undefined);
        const nodesByRank = {};
        objPhaseNodeIds.forEach(id => {
          const r = ranks[id];
          if (!nodesByRank[r]) nodesByRank[r] = [];
          nodesByRank[r].push(id);
        });
        Object.values(nodesByRank).forEach(arr => {
          arr.sort((a, b) => {
            const na = nodes.find(n => n.id === a);
            const nb = nodes.find(n => n.id === b);
            return (na?.label || '').localeCompare(nb?.label || '');
          });
        });

        let maxWidth = 0;
        for (let r = 0; r <= maxRank; r++) {
          const rNodes = nodesByRank[r] || [];
          let rowWidth = 0;
          rNodes.forEach((id, i) => {
            const node = nodes.find(n => n.id === id);
            if (node) {
              rowWidth += getNodeWidth(node);
              if (i < rNodes.length - 1) rowWidth += horizontalGap;
            }
          });
          maxWidth = Math.max(maxWidth, rowWidth);
        }

        columns.push({ type: 'object', objId, nodesByRank, maxWidth });
      });

      looseNodeIds.forEach(id => {
        const node = nodes.find(n => n.id === id);
        const r = ranks[id];
        const nodesByRank = {};
        nodesByRank[r] = [id];
        columns.push({ type: 'loose', nodesByRank, maxWidth: node ? getNodeWidth(node) : 50 });
      });

      phaseColumnData[phaseId] = { columns, maxRank };
    });

    // === Step 3: Compute positions from a given column ordering ===
    const computePositions = (columnOrders) => {
      const positions = {};
      let currentY = startY;

      allPhaseIds.forEach((phaseId, phaseIdx) => {
        const data = phaseColumnData[phaseId];
        if (!data) return;
        if (phaseIdx > 0) currentY += phaseGap;

        const cols = columnOrders[phaseId];
        if (!cols || cols.length === 0) return;

        let totalWidth = 0;
        cols.forEach((col, i) => {
          totalWidth += col.maxWidth;
          if (i < cols.length - 1) {
            const nextCol = cols[i + 1];
            const isObjBoundary = col.type === 'object' || nextCol.type === 'object';
            totalWidth += isObjBoundary ? objectGap : horizontalGap;
          }
        });

        const phaseStartX = Math.max(50, 400 - totalWidth / 2);

        const colXStarts = [];
        let x = phaseStartX;
        cols.forEach((col, i) => {
          colXStarts.push(x);
          x += col.maxWidth;
          if (i < cols.length - 1) {
            const nextCol = cols[i + 1];
            const isObjBoundary = col.type === 'object' || nextCol.type === 'object';
            x += isObjBoundary ? objectGap : horizontalGap;
          }
        });

        const phaseStartY = currentY;
        for (let r = 0; r <= data.maxRank; r++) {
          const rankY = phaseStartY + r * (nodeHeight + verticalGap);
          cols.forEach((col, colIdx) => {
            const colX = colXStarts[colIdx];
            const colWidth = col.maxWidth;
            const rNodes = col.nodesByRank[r] || [];
            let rowWidth = 0;
            rNodes.forEach((id, i) => {
              const node = nodes.find(n => n.id === id);
              if (node) {
                rowWidth += getNodeWidth(node);
                if (i < rNodes.length - 1) rowWidth += horizontalGap;
              }
            });
            let nodeX = colX + (colWidth - rowWidth) / 2;
            rNodes.forEach(id => {
              const node = nodes.find(n => n.id === id);
              if (node) {
                positions[id] = { x: nodeX, y: rankY };
                nodeX += getNodeWidth(node) + horizontalGap;
              }
            });
          });
          currentY = rankY + nodeHeight;
        }
      });

      return positions;
    };

    // === Step 4: Identify long vertical edges (spanning multiple phases) ===
    // These should be placed at the outer edges of the matrix to reduce visual clutter
    const longEdgeNodes = new Set();
    const nodePhaseIndex = {};
    nodes.forEach(node => {
      const idx = phases.findIndex(p => p.id === node.phase);
      nodePhaseIndex[node.id] = idx >= 0 ? idx : -1;
    });

    edges.forEach(edge => {
      const srcIdx = nodePhaseIndex[edge.source];
      const tgtIdx = nodePhaseIndex[edge.target];
      if (srcIdx >= 0 && tgtIdx >= 0) {
        const phaseSpan = Math.abs(tgtIdx - srcIdx);
        // Consider edges spanning 2+ phases as "long"
        if (phaseSpan >= 2) {
          longEdgeNodes.add(edge.source);
          longEdgeNodes.add(edge.target);
        }
      }
    });

    // === Step 5: Sort columns by median position of connected nodes ===
    // direction: 'down' = use parent positions, 'up' = use child positions
    const sortColumnsByMedian = (columns, positions, direction) => {
      const columnMedians = columns.map((col, colIdx) => {
        const allNodeIds = Object.values(col.nodesByRank).flat();
        const connectedPositions = [];

        allNodeIds.forEach(nodeId => {
          edges.forEach(e => {
            let connectedId;
            if (direction === 'down' && e.target === nodeId) connectedId = e.source;
            if (direction === 'up' && e.source === nodeId) connectedId = e.target;
            if (connectedId && positions[connectedId]) {
              const connNode = nodes.find(n => n.id === connectedId);
              const connWidth = connNode ? getNodeWidth(connNode) : 50;
              connectedPositions.push(positions[connectedId].x + connWidth / 2);
            }
          });
        });

        let median = colIdx * 1000; // Fallback: preserve order
        if (connectedPositions.length > 0) {
          connectedPositions.sort((a, b) => a - b);
          const mid = Math.floor(connectedPositions.length / 2);
          median = connectedPositions.length % 2 === 1
            ? connectedPositions[mid]
            : (connectedPositions[mid - 1] + connectedPositions[mid]) / 2;
        }

        // Check if this column contains nodes with long edges
        const hasLongEdgeNode = allNodeIds.some(id => longEdgeNodes.has(id));

        return { col, median, hasConnections: connectedPositions.length > 0, hasLongEdgeNode };
      });

      columnMedians.sort((a, b) => {
        if (a.hasConnections && !b.hasConnections) return -1;
        if (!a.hasConnections && b.hasConnections) return 1;
        return a.median - b.median;
      });

      return columnMedians.map(cm => cm.col);
    };

    // === Step 6: Move columns with long edges to outer positions ===
    // This function is called AFTER the median-based sorting, so we can use
    // the current column order to determine left vs right placement
    const moveLongEdgesToOuter = (columns, positions) => {
      if (columns.length <= 2) return columns;

      const allNodeIdsInCol = (col) => Object.values(col.nodesByRank).flat();
      
      // Calculate center X of the current layout
      let minX = Infinity, maxX = -Infinity;
      columns.forEach(col => {
        allNodeIdsInCol(col).forEach(id => {
          if (positions[id]) {
            const node = nodes.find(n => n.id === id);
            const w = node ? getNodeWidth(node) : 50;
            minX = Math.min(minX, positions[id].x);
            maxX = Math.max(maxX, positions[id].x + w);
          }
        });
      });
      const centerX = (minX + maxX) / 2;

      // Separate columns with and without long edge nodes
      const longEdgeColsLeft = [];
      const longEdgeColsRight = [];
      const normalCols = [];
      
      columns.forEach((col, colIdx) => {
        const nodeIds = allNodeIdsInCol(col);
        const hasLongEdge = nodeIds.some(id => longEdgeNodes.has(id));
        
        if (hasLongEdge) {
          // Determine if this column should go left or right
          // based on the median position of its connected nodes across phases
          const connectedXPositions = [];
          nodeIds.forEach(nodeId => {
            edges.forEach(e => {
              let connectedId;
              if (e.source === nodeId) connectedId = e.target;
              if (e.target === nodeId) connectedId = e.source;
              if (connectedId && positions[connectedId]) {
                const connNode = nodes.find(n => n.id === connectedId);
                const connWidth = connNode ? getNodeWidth(connNode) : 50;
                connectedXPositions.push(positions[connectedId].x + connWidth / 2);
              }
            });
          });

          let avgX = centerX;
          if (connectedXPositions.length > 0) {
            avgX = connectedXPositions.reduce((a, b) => a + b, 0) / connectedXPositions.length;
          }

          // Place columns with connections predominantly on the left side -> to the left
          // Place columns with connections predominantly on the right side -> to the right
          if (avgX < centerX) {
            longEdgeColsLeft.push({ col, avgX });
          } else {
            longEdgeColsRight.push({ col, avgX });
          }
        } else {
          normalCols.push(col);
        }
      });

      if (longEdgeColsLeft.length === 0 && longEdgeColsRight.length === 0) {
        return columns;
      }

      // Sort left columns by avgX (ascending - leftmost first)
      longEdgeColsLeft.sort((a, b) => a.avgX - b.avgX);
      // Sort right columns by avgX (descending - rightmost last)
      longEdgeColsRight.sort((a, b) => b.avgX - a.avgX);

      // Combine: left long-edge cols + normal cols + right long-edge cols
      return [
        ...longEdgeColsLeft.map(item => item.col),
        ...normalCols,
        ...longEdgeColsRight.map(item => item.col)
      ];
    };

    // === Step 7: Multi-pass layout (top-down + bottom-up, iterate) ===
    const columnOrders = {};
    allPhaseIds.forEach(phaseId => {
      if (phaseColumnData[phaseId]) {
        columnOrders[phaseId] = [...phaseColumnData[phaseId].columns];
      }
    });

    for (let pass = 0; pass < 4; pass++) {
      let positions = computePositions(columnOrders);

      // Top-down: sort each phase by parent positions above
      for (let i = 0; i < allPhaseIds.length; i++) {
        const phaseId = allPhaseIds[i];
        if (!phaseColumnData[phaseId]) continue;
        columnOrders[phaseId] = sortColumnsByMedian(columnOrders[phaseId], positions, 'down');
        positions = computePositions(columnOrders);
      }

      // Bottom-up: sort each phase by child positions below
      for (let i = allPhaseIds.length - 1; i >= 0; i--) {
        const phaseId = allPhaseIds[i];
        if (!phaseColumnData[phaseId]) continue;
        columnOrders[phaseId] = sortColumnsByMedian(columnOrders[phaseId], positions, 'up');
        positions = computePositions(columnOrders);
      }
    }

    // === Step 8: Final pass - move long-edge columns to outer positions ===
    // Compute positions first to use for intelligent left/right placement
    let finalPositions = computePositions(columnOrders);
    allPhaseIds.forEach(phaseId => {
      if (columnOrders[phaseId]) {
        columnOrders[phaseId] = moveLongEdgesToOuter(columnOrders[phaseId], finalPositions);
      }
    });

    // Final positions
    const newPositions = computePositions(columnOrders);

    setNodes(prev => prev.map(node => ({
      ...node,
      x: newPositions[node.id]?.x ?? node.x,
      y: newPositions[node.id]?.y ?? node.y
    })));

    resetView();
  };

  // === Stratigraphy Validation ===
  const validateStratigraphy = useCallback(() => {
    const issues = [];
    const warnings = [];

    // --- 0. Duplicate Label Detection ---
    const labelCount = {};
    nodes.forEach(node => {
      const normalizedLabel = node.label.toLowerCase().trim();
      if (!labelCount[normalizedLabel]) {
        labelCount[normalizedLabel] = [];
      }
      labelCount[normalizedLabel].push(node);
    });

    Object.entries(labelCount).forEach(([label, duplicateNodes]) => {
      if (duplicateNodes.length > 1) {
        issues.push({
          type: 'duplicate_label',
          severity: 'error',
          message: `Duplicate label "${duplicateNodes[0].label}" used by ${duplicateNodes.length} units`,
          nodeIds: duplicateNodes.map(n => n.id),
          description: 'Each unit must have a unique label. Rename the duplicates to avoid confusion.'
        });
      }
    });

    // --- 1. Cycle Detection (DFS-based) ---
    const adj = {};
    nodes.forEach(n => { adj[n.id] = []; });
    edges.forEach(e => {
      if (adj[e.source]) adj[e.source].push(e.target);
    });

    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = {};
    const parentMap = {};
    nodes.forEach(n => { color[n.id] = WHITE; parentMap[n.id] = null; });

    const cycles = [];
    const dfs = (u) => {
      color[u] = GRAY;
      for (const v of (adj[u] || [])) {
        if (color[v] === GRAY) {
          const cycle = [v];
          let cur = u;
          while (cur && cur !== v) {
            cycle.push(cur);
            cur = parentMap[cur];
          }
          cycle.push(v);
          cycle.reverse();
          cycles.push(cycle);
        } else if (color[v] === WHITE) {
          parentMap[v] = u;
          dfs(v);
        }
      }
      color[u] = BLACK;
    };
    nodes.forEach(n => { if (color[n.id] === WHITE) dfs(n.id); });

    cycles.forEach(cycle => {
      const labels = cycle.map(id => {
        const n = nodes.find(nd => nd.id === id);
        return n ? n.label : id;
      });
      issues.push({
        type: 'cycle',
        severity: 'error',
        message: `Cycle: ${labels.join(' → ')}`,
        nodeIds: cycle.filter((id, i) => i < cycle.length - 1),
        description: 'A Harris Matrix must be a DAG. Cycles represent logical contradictions in the stratigraphy.'
      });
    });

    // --- 2. Phase direction consistency ---
    edges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      if (!sourceNode || !targetNode) return;
      if (!sourceNode.phase || !targetNode.phase) return;

      const srcIdx = phases.findIndex(p => p.id === sourceNode.phase);
      const tgtIdx = phases.findIndex(p => p.id === targetNode.phase);
      if (srcIdx === -1 || tgtIdx === -1) return;

      // source is above (younger), target is below (older). srcIdx should be <= tgtIdx.
      if (srcIdx > tgtIdx) {
        const srcPhase = phases[srcIdx];
        const tgtPhase = phases[tgtIdx];
        issues.push({
          type: 'phase_direction',
          severity: 'error',
          message: `${sourceNode.label} (${srcPhase.name}) → ${targetNode.label} (${tgtPhase.name}): older phase above younger`,
          nodeIds: [sourceNode.id, targetNode.id],
          edgeId: edge.id,
          description: 'A unit from an older phase cannot lie above a unit from a younger phase.'
        });
      }
    });

    // --- 3. Phase-skipping edges ---
    edges.forEach(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      if (!sourceNode || !targetNode) return;
      if (!sourceNode.phase || !targetNode.phase) return;

      const srcIdx = phases.findIndex(p => p.id === sourceNode.phase);
      const tgtIdx = phases.findIndex(p => p.id === targetNode.phase);
      if (srcIdx === -1 || tgtIdx === -1) return;

      const skippedPhases = [];
      for (let i = srcIdx + 1; i < tgtIdx; i++) {
        skippedPhases.push(phases[i]);
      }
      if (skippedPhases.length === 0) return;

      // Check if any intermediate path goes through skipped phases
      const visited = new Set();
      const queue = [sourceNode.id];
      visited.add(sourceNode.id);
      let hasIntermediatePath = false;

      while (queue.length > 0) {
        const cur = queue.shift();
        for (const next of (adj[cur] || [])) {
          if (next === targetNode.id) continue;
          if (visited.has(next)) continue;
          visited.add(next);
          const nextNode = nodes.find(n => n.id === next);
          if (nextNode && skippedPhases.some(sp => sp.id === nextNode.phase)) {
            hasIntermediatePath = true;
            break;
          }
          queue.push(next);
        }
        if (hasIntermediatePath) break;
      }

      if (!hasIntermediatePath) {
        warnings.push({
          type: 'phase_skip',
          severity: 'warning',
          message: `${sourceNode.label} → ${targetNode.label} skips ${skippedPhases.map(p => p.name).join(', ')}`,
          nodeIds: [sourceNode.id, targetNode.id],
          edgeId: edge.id,
          description: 'Relation crosses phases without intermediate units. May indicate missing stratigraphy or incorrect phasing.'
        });
      }
    });

    // --- 4. Isolated nodes ---
    nodes.forEach(node => {
      const hasEdges = edges.some(e => e.source === node.id || e.target === node.id);
      if (!hasEdges) {
        warnings.push({
          type: 'isolated',
          severity: 'warning',
          message: `${node.label} has no stratigraphic relations`,
          nodeIds: [node.id],
          description: 'Every unit should be connected to at least one other unit.'
        });
      }
    });

    // --- 5. No phase assigned ---
    nodes.forEach(node => {
      if (!node.phase || !phases.some(p => p.id === node.phase)) {
        warnings.push({
          type: 'no_phase',
          severity: 'warning',
          message: `${node.label} has no phase assigned`,
          nodeIds: [node.id],
          description: 'Consider assigning a phase based on its stratigraphic relationships.'
        });
      }
    });

    // --- 6. Dangling roots/leaves within phases ---
    if (phases.length > 0) {
      const youngestPhaseId = phases[0].id;
      const oldestPhaseId = phases[phases.length - 1].id;

      nodes.forEach(node => {
        if (!node.phase) return;
        const hasOutgoing = edges.some(e => e.source === node.id);
        const hasIncoming = edges.some(e => e.target === node.id);

        if (!hasOutgoing && node.phase !== oldestPhaseId) {
          const phase = phases.find(p => p.id === node.phase);
          if (phase) {
            warnings.push({
              type: 'dangling_leaf',
              severity: 'info',
              message: `${node.label} (${phase.name}) has no units below`,
              nodeIds: [node.id],
              description: 'Not in the oldest phase but has no underlying relations.'
            });
          }
        }

        if (!hasIncoming && node.phase !== youngestPhaseId) {
          const phase = phases.find(p => p.id === node.phase);
          if (phase) {
            warnings.push({
              type: 'dangling_root',
              severity: 'info',
              message: `${node.label} (${phase.name}) has no units above`,
              nodeIds: [node.id],
              description: 'Not in the youngest phase but has no overlying relations.'
            });
          }
        }
      });
    }

    // --- 7. Redundant (transitive) edges ---
    const reachableCache = {};
    const computeReachable = (startId) => {
      if (reachableCache[startId]) return reachableCache[startId];
      const visited = new Set();
      const stack = [...(adj[startId] || [])];
      while (stack.length > 0) {
        const cur = stack.pop();
        if (visited.has(cur)) continue;
        visited.add(cur);
        for (const next of (adj[cur] || [])) {
          stack.push(next);
        }
      }
      reachableCache[startId] = visited;
      return visited;
    };

    edges.forEach(edge => {
      const directChildren = (adj[edge.source] || []).filter(id => id !== edge.target);
      for (const child of directChildren) {
        const childReachable = computeReachable(child);
        if (childReachable.has(edge.target)) {
          const sourceNode = nodes.find(n => n.id === edge.source);
          const targetNode = nodes.find(n => n.id === edge.target);
          if (sourceNode && targetNode) {
            warnings.push({
              type: 'redundant_edge',
              severity: 'info',
              message: `${sourceNode.label} → ${targetNode.label} is redundant (transitively implied)`,
              nodeIds: [sourceNode.id, targetNode.id],
              edgeId: edge.id,
              description: 'Already implied through other paths. Removing simplifies the matrix.'
            });
          }
          break;
        }
      }
    });

    // Sort: errors first, then warnings, then info
    const severityOrder = { error: 0, warning: 1, info: 2 };
    const allIssues = [...issues, ...warnings].sort((a, b) =>
      severityOrder[a.severity] - severityOrder[b.severity]
    );

    const counts = {
      error: allIssues.filter(i => i.severity === 'error').length,
      warning: allIssues.filter(i => i.severity === 'warning').length,
      info: allIssues.filter(i => i.severity === 'info').length,
    };

    setValidationResults({ issues: allIssues, counts, timestamp: Date.now() });
    setShowValidation(true);
  }, [nodes, edges, phases]);

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-300 p-2 flex items-center gap-2 flex-wrap">
        <h1 className="text-lg font-bold text-gray-800">HME – Harris Matrix Editor</h1>
        {/* AutoSave indicator */}
        <div className="flex items-center gap-1 text-xs">
          {showAutoSaveIndicator && (
            <span className="text-green-600 animate-pulse">✓ Saved</span>
          )}
          {autoSaveEnabled && lastAutoSave && !showAutoSaveIndicator && (
            <span className="text-gray-400" title={`Last autosave: ${lastAutoSave.toLocaleTimeString()}`}>
              🔄 AutoSave ON
            </span>
          )}
          <button
            onClick={() => setAutoSaveEnabled(!autoSaveEnabled)}
            className={`px-1.5 py-0.5 rounded text-xs ${autoSaveEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
            title={autoSaveEnabled ? 'Disable AutoSave' : 'Enable AutoSave'}
          >
            {autoSaveEnabled ? '●' : '○'}
          </button>
        </div>
        <div className="h-6 w-px bg-gray-300" />
        <button
          onClick={() => {
            pushUndo();
            const newNode = {
              id: String(nextId.current++),
              label: generateUniqueLabel(),
              description: '',
              type: 'layer',
              phase: '',
              x: 300 - viewport.x / viewport.zoom,
              y: 200 - viewport.y / viewport.zoom
            };
            setNodes(prev => [...prev, newNode]);
            setSelectedNode(newNode.id);
          }}
          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
        >
          + New Unit
        </button>
        <button
          onClick={deleteSelected}
          disabled={!selectedNode && !selectedEdge && selectedNodes.size === 0}
          className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
        >
          Delete {selectedNodes.size > 0 ? `(${selectedNodes.size})` : ''}
        </button>
        <button
          onClick={undo}
          disabled={undoStack.current.length === 0}
          className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-sm"
          title="Undo (Ctrl+Z)"
        >
          ↩ Undo
        </button>
        <button
          onClick={redo}
          disabled={redoStack.current.length === 0}
          className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-sm"
          title="Redo (Ctrl+Y)"
        >
          ↪ Redo
        </button>
        <div className="h-6 w-px bg-gray-300" />
        <button
          onClick={() => setViewport(prev => ({ ...prev, zoom: Math.min(3, prev.zoom * 1.2) }))}
          className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm"
        >
          Zoom +
        </button>
        <button
          onClick={() => setViewport(prev => ({ ...prev, zoom: Math.max(0.2, prev.zoom * 0.8) }))}
          className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm"
        >
          Zoom -
        </button>
        <button
          onClick={resetView}
          className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm"
        >
          Reset
        </button>
        <span className="text-sm text-gray-500">{Math.round(viewport.zoom * 100)}%</span>
        <div className="h-6 w-px bg-gray-300" />
        <button
          onClick={() => {
            setShowSearch(!showSearch);
            if (showSearch) {
              setSearchResults([]);
              setSearchTerm('');
            }
          }}
          className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm"
        >
          🔍 Search
        </button>
        {showSearch && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                performSearch(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (e.shiftKey) {
                    navigateSearchResult(-1);
                  } else {
                    navigateSearchResult(1);
                  }
                }
              }}
              placeholder="Unit number..."
              className="px-2 py-1 border rounded text-sm w-32"
              autoFocus
            />
            {searchResults.length > 0 && (
              <>
                <button
                  onClick={() => navigateSearchResult(-1)}
                  className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm"
                  title="Previous match (Shift+Enter)"
                >
                  ◀
                </button>
                <span className="text-sm text-gray-600">
                  {currentSearchIndex + 1} / {searchResults.length}
                </span>
                <button
                  onClick={() => navigateSearchResult(1)}
                  className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm"
                  title="Next match (Enter)"
                >
                  ▶
                </button>
              </>
            )}
            {searchTerm && searchResults.length === 0 && (
              <span className="text-sm text-red-500">No matches</span>
            )}
          </div>
        )}
        <div className="h-6 w-px bg-gray-300" />
        <label className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm cursor-pointer">
          📂 Import
          <input type="file" accept=".json,.graphml" onChange={importData} className="hidden" />
        </label>
        <label className="px-3 py-1 bg-cyan-500 text-white rounded hover:bg-cyan-600 text-sm cursor-pointer" title="Import polygons from QGIS GeoJSON">
          🗺️ + GeoJSON
          <input type="file" accept=".geojson,.json" onChange={handleGeoJSONFile} className="hidden" />
        </label>
        <button
          onClick={exportData}
          className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
        >
          💾 Save
        </button>
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className={`px-3 py-1 rounded text-sm flex items-center gap-1 ${showExportMenu ? 'bg-purple-600 text-white' : 'bg-purple-500 text-white hover:bg-purple-600'}`}
          >
            📤 Export ▾
          </button>
          {showExportMenu && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-56 py-1">
              <button
                onClick={() => { exportGraphML(); setShowExportMenu(false); }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <span className="w-5 text-center">📐</span>
                <div>
                  <div className="font-medium">GraphML</div>
                  <div className="text-xs text-gray-500">For yEd, Gephi, etc.</div>
                </div>
              </button>
              <button
                onClick={() => { exportSVG(); setShowExportMenu(false); }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <span className="w-5 text-center">🖼️</span>
                <div>
                  <div className="font-medium">SVG</div>
                  <div className="text-xs text-gray-500">Vector graphic for print/publication</div>
                </div>
              </button>
              <div className="border-t my-1" />
              <button
                onClick={() => { exportGeoJSON(); setShowExportMenu(false); }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <span className="w-5 text-center">🗺️</span>
                <div>
                  <div className="font-medium">GeoJSON</div>
                  <div className="text-xs text-gray-500">For QGIS integration</div>
                </div>
              </button>
            </div>
          )}
        </div>
        <div className="h-6 w-px bg-gray-300" />
        <button
          onClick={() => setShowPhaseManager(!showPhaseManager)}
          className={`px-3 py-1 rounded text-sm ${showPhaseManager ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}`}
        >
          📊 Phases
        </button>
        <button
          onClick={() => setShowObjectManager(!showObjectManager)}
          className={`px-3 py-1 rounded text-sm ${showObjectManager ? 'bg-violet-600 text-white' : 'bg-violet-100 text-violet-700 hover:bg-violet-200'}`}
        >
          📦 Objects
        </button>
        <button
          onClick={autoLayoutByPhase}
          className="px-3 py-1 bg-teal-500 text-white rounded hover:bg-teal-600 text-sm"
          title="Arrange units by phase"
        >
          ⚡ Auto-Layout
        </button>
        <button
          onClick={() => setShowLayoutSettings(!showLayoutSettings)}
          className={`px-3 py-1 rounded text-sm ${showLayoutSettings ? 'bg-teal-600 text-white' : 'bg-teal-100 text-teal-700 hover:bg-teal-200'}`}
          title="Layout Settings"
        >
          ⚙️
        </button>
        <button
          onClick={validateStratigraphy}
          className={`px-3 py-1 rounded text-sm ${showValidation ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
          title="Validate stratigraphy"
        >
          ✓ Validate
        </button>
        <button
          onClick={() => setShowMapPanel(!showMapPanel)}
          className={`px-3 py-1 rounded text-sm ${showMapPanel ? 'bg-cyan-600 text-white' : 'bg-cyan-500 text-white hover:bg-cyan-600'}`}
          title="Toggle map view"
        >
          🗺️ Map
        </button>
        {(selectedNodes.size > 0 || selectedNode) && (
          <div className="flex items-center gap-1 ml-2">
            <span className="text-sm text-gray-600">
              {selectedNodes.size > 0 ? `${selectedNodes.size} selected →` : 'Phase:'}
            </span>
            {phases.map(phase => (
              <button
                key={phase.id}
                onClick={() => assignPhaseToSelected(phase.id)}
                className="w-7 h-7 rounded text-white text-xs font-bold hover:scale-110 transition-transform"
                style={{ backgroundColor: phase.color }}
                title={phase.name}
              >
                {phase.id}
              </button>
            ))}
            <button
              onClick={() => assignPhaseToSelected('')}
              className="w-7 h-7 rounded bg-gray-300 text-gray-600 text-xs hover:bg-gray-400"
              title="Remove phase"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Canvas */}
        <div className={`flex flex-col ${showMapPanel ? 'w-1/2' : 'flex-1'}`}>
        <svg
          ref={svgRef}
          className="flex-1"
          style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onMouseDown={handleSvgMouseDown}
          onDoubleClick={handleDoubleClick}
          onWheel={handleWheel}
        >
          {/* Background */}
          <rect className="background" width="100%" height="100%" fill="#f5f5f5" />
          
          {/* Grid */}
          <defs>
            <pattern id="grid" width={50 * viewport.zoom} height={50 * viewport.zoom} patternUnits="userSpaceOnUse">
              <path
                d={`M ${50 * viewport.zoom} 0 L 0 0 0 ${50 * viewport.zoom}`}
                fill="none"
                stroke="#ddd"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" className="background" />

          <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}>
            {/* Phase strips on the left */}
            {(() => {
              const phaseRanges = getPhaseYRanges();
              const stripWidth = 25;
              const stripX = 10;
              const padding = 15;
              
              return phases.map(phase => {
                const range = phaseRanges[phase.id];
                if (!range || range.minY === Infinity) return null;
                
                return (
                  <g key={`phase-strip-${phase.id}`}>
                    <rect
                      x={stripX}
                      y={range.minY - padding}
                      width={stripWidth}
                      height={range.maxY - range.minY + padding * 2}
                      fill={phase.color}
                      opacity={0.8}
                      rx={3}
                    />
                    <text
                      x={stripX + stripWidth / 2}
                      y={range.minY + (range.maxY - range.minY) / 2}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight="bold"
                      fill="white"
                      transform={`rotate(-90, ${stripX + stripWidth / 2}, ${range.minY + (range.maxY - range.minY) / 2})`}
                    >
                      {phase.name.length > 20 ? phase.name.slice(0, 20) + '...' : phase.name}
                    </text>
                  </g>
                );
              });
            })()}

            {/* Helper function to check if a line segment intersects a polygon */}
            {(() => {
              // Function to check if point is inside polygon
              const pointInPolygon = (point, polygon) => {
                let inside = false;
                for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                  const xi = polygon[i].x, yi = polygon[i].y;
                  const xj = polygon[j].x, yj = polygon[j].y;
                  if (((yi > point.y) !== (yj > point.y)) &&
                      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
                    inside = !inside;
                  }
                }
                return inside;
              };

              // Function to check if line segment intersects polygon
              const lineIntersectsPolygon = (p1, p2, polygon) => {
                // Check if midpoint is inside
                const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                if (pointInPolygon(mid, polygon)) return true;
                
                // Check quarter points for longer edges
                const q1 = { x: (p1.x + mid.x) / 2, y: (p1.y + mid.y) / 2 };
                const q3 = { x: (mid.x + p2.x) / 2, y: (mid.y + p2.y) / 2 };
                if (pointInPolygon(q1, polygon) || pointInPolygon(q3, polygon)) return true;
                
                return false;
              };

              // Pre-calculate hulls for all objects
              const objectHulls = objects.map(obj => {
                if (obj.nodeIds.length < 1) return null;
                
                const objNodes = obj.nodeIds
                  .map(id => nodes.find(n => n.id === id))
                  .filter(Boolean);
                
                if (objNodes.length === 0) return null;

                const padding = 12;
                const getNodeWidth = (node) => {
                  const displayLabel = node.label.replace(/^SU\s*/i, '');
                  return Math.max(50, displayLabel.length * 9 + 30);
                };
                const nodeHeight = 28;

                const points = [];
                objNodes.forEach(node => {
                  const w = getNodeWidth(node);
                  const h = nodeHeight;
                  points.push({ x: node.x - padding, y: node.y - padding });
                  points.push({ x: node.x + w + padding, y: node.y - padding });
                  points.push({ x: node.x + w + padding, y: node.y + h + padding });
                  points.push({ x: node.x - padding, y: node.y + h + padding });
                });

                const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
                const sortedPoints = [...points].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
                
                const lower = [];
                for (const p of sortedPoints) {
                  while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
                    lower.pop();
                  }
                  lower.push(p);
                }

                const upper = [];
                for (let i = sortedPoints.length - 1; i >= 0; i--) {
                  const p = sortedPoints[i];
                  while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
                    upper.pop();
                  }
                  upper.push(p);
                }

                lower.pop();
                upper.pop();
                const hull = [...lower, ...upper];

                if (hull.length < 3) return null;

                return { obj, hull, nodeIds: new Set(obj.nodeIds) };
              }).filter(Boolean);

              // Classify edges: does this edge pass through a "foreign" object hull?
              const classifyEdge = (edge) => {
                const sourceNode = nodes.find(n => n.id === edge.source);
                const targetNode = nodes.find(n => n.id === edge.target);
                if (!sourceNode || !targetNode) return { passesThroughForeignHull: false };

                const sourceLabel = sourceNode.label.replace(/^SU\s*/i, '');
                const targetLabel = targetNode.label.replace(/^SU\s*/i, '');
                const sourceWidth = Math.max(50, sourceLabel.length * 9 + 30);
                const targetWidth = Math.max(50, targetLabel.length * 9 + 30);
                const nodeHeight = 28;

                const startX = sourceNode.x + sourceWidth / 2;
                const startY = sourceNode.y + nodeHeight;
                const endX = targetNode.x + targetWidth / 2;
                const endY = targetNode.y;
                const midY = startY + (endY - startY) / 2;

                // Edge path points
                const edgePoints = Math.abs(startX - endX) > 5
                  ? [{ x: startX, y: startY }, { x: startX, y: midY }, { x: endX, y: midY }, { x: endX, y: endY }]
                  : [{ x: startX, y: startY }, { x: endX, y: endY }];

                // Check each object hull
                for (const { obj, hull, nodeIds } of objectHulls) {
                  // Skip if source or target belongs to this object
                  if (nodeIds.has(edge.source) || nodeIds.has(edge.target)) continue;

                  // Check if any segment of the edge passes through this hull
                  for (let i = 0; i < edgePoints.length - 1; i++) {
                    if (lineIntersectsPolygon(edgePoints[i], edgePoints[i + 1], hull)) {
                      return { passesThroughForeignHull: true, foreignObject: obj };
                    }
                  }
                }

                return { passesThroughForeignHull: false };
              };

              // Separate edges into two groups
              const throughEdges = [];
              const normalEdges = [];
              
              edges.forEach(edge => {
                const classification = classifyEdge(edge);
                if (classification.passesThroughForeignHull) {
                  throughEdges.push({ edge, foreignObject: classification.foreignObject });
                } else {
                  normalEdges.push(edge);
                }
              });

              // Render function for edges
              const renderEdge = (edge, isThroughEdge = false, foreignObject = null) => {
                const sourceNode = nodes.find(n => n.id === edge.source);
                const targetNode = nodes.find(n => n.id === edge.target);
                if (!sourceNode || !targetNode) return null;

                const sourceLabel = sourceNode.label.replace(/^SU\s*/i, '');
                const targetLabel = targetNode.label.replace(/^SU\s*/i, '');
                const sourceWidth = Math.max(50, sourceLabel.length * 9 + 30);
                const targetWidth = Math.max(50, targetLabel.length * 9 + 30);
                const nodeHeight = 28;

                const startX = sourceNode.x + sourceWidth / 2;
                const startY = sourceNode.y + nodeHeight;
                const endX = targetNode.x + targetWidth / 2;
                const endY = targetNode.y;
                const midY = startY + (endY - startY) / 2;
                const needsDetour = Math.abs(startX - endX) > 5;

                const pathD = needsDetour
                  ? `M ${startX} ${startY} L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`
                  : `M ${startX} ${startY} L ${endX} ${endY}`;

                const arrowSize = 5;
                const isSelected = selectedEdge === edge.id;
                
                // Style for through-edges: reduced opacity and dashed
                const throughStyle = isThroughEdge ? {
                  opacity: 0.35,
                  strokeDasharray: '4,3'
                } : {};

                return (
                  <g key={edge.id + (isThroughEdge ? '-through' : '')}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                      onClick={(e) => handleEdgeClick(e, edge.id)}
                      style={{ cursor: 'pointer' }}
                    />
                    <path
                      d={pathD}
                      fill="none"
                      stroke={isSelected ? '#3b82f6' : '#666'}
                      strokeWidth={isSelected ? 2.5 : 1}
                      onClick={(e) => handleEdgeClick(e, edge.id)}
                      className="hover:stroke-blue-400"
                      style={{ cursor: 'pointer', ...throughStyle }}
                    />
                    <polygon
                      points={`${endX},${endY} ${endX - arrowSize},${endY - arrowSize * 1.5} ${endX + arrowSize},${endY - arrowSize * 1.5}`}
                      fill={isSelected ? '#3b82f6' : '#666'}
                      onClick={(e) => handleEdgeClick(e, edge.id)}
                      style={{ cursor: 'pointer', opacity: isThroughEdge ? 0.35 : 1 }}
                    />
                  </g>
                );
              };

              return (
                <>
                  {/* Edges that pass through foreign hulls - rendered BEFORE hulls */}
                  {throughEdges.map(({ edge, foreignObject }) => renderEdge(edge, true, foreignObject))}
                </>
              );
            })()}

            {/* Object hulls */}
            {objects.map(obj => {
              if (obj.nodeIds.length < 1) return null;
              
              const objNodes = obj.nodeIds
                .map(id => nodes.find(n => n.id === id))
                .filter(Boolean);
              
              if (objNodes.length === 0) return null;

              // Calculate bounding box with padding
              const padding = 12;
              const getNodeWidth = (node) => {
                const displayLabel = node.label.replace(/^SU\s*/i, '');
                return Math.max(50, displayLabel.length * 9 + 30);
              };
              const nodeHeight = 28;

              // Collect all corner points of nodes
              const points = [];
              objNodes.forEach(node => {
                const w = getNodeWidth(node);
                const h = nodeHeight;
                points.push({ x: node.x - padding, y: node.y - padding });
                points.push({ x: node.x + w + padding, y: node.y - padding });
                points.push({ x: node.x + w + padding, y: node.y + h + padding });
                points.push({ x: node.x - padding, y: node.y + h + padding });
              });

              // Calculate convex hull (Graham Scan)
              const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
              
              const sortedPoints = [...points].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
              
              const lower = [];
              for (const p of sortedPoints) {
                while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
                  lower.pop();
                }
                lower.push(p);
              }

              const upper = [];
              for (let i = sortedPoints.length - 1; i >= 0; i--) {
                const p = sortedPoints[i];
                while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
                  upper.pop();
                }
                upper.push(p);
              }

              lower.pop();
              upper.pop();
              const hull = [...lower, ...upper];

              if (hull.length < 3) return null;

              // Create rounded path
              const pathD = hull.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

              return (
                <g key={`hull-${obj.id}`} style={{ cursor: 'pointer' }}>
                  {/* Invisible wider hit area for easier clicking */}
                  <path
                    d={pathD}
                    fill="transparent"
                    stroke="transparent"
                    strokeWidth={12}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowObjectManager(true);
                      setSelectedObject(obj.id);
                      selectObjectNodes(obj.id);
                    }}
                  />
                  <path
                    d={pathD}
                    fill={selectedObject === obj.id ? `${obj.color}30` : `${obj.color}15`}
                    stroke={selectedObject === obj.id ? obj.color : '#555'}
                    strokeWidth={selectedObject === obj.id ? 2.5 : 1.5}
                    strokeDasharray="6,3"
                    strokeLinejoin="round"
                    className="hover:opacity-80"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowObjectManager(true);
                      setSelectedObject(obj.id);
                      selectObjectNodes(obj.id);
                    }}
                  />
                  {/* Object label */}
                  {hull.length > 0 && (
                    <text
                      x={Math.min(...hull.map(p => p.x)) + 5}
                      y={Math.min(...hull.map(p => p.y)) - 5}
                      fontSize={11}
                      fontWeight="bold"
                      fill={selectedObject === obj.id ? obj.color : '#555'}
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowObjectManager(true);
                        setSelectedObject(obj.id);
                        selectObjectNodes(obj.id);
                      }}
                    >
                      {obj.name}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Normal edges (not passing through foreign hulls) - rendered AFTER hulls */}
            {(() => {
              // Re-calculate which edges are normal (not through foreign hulls)
              const pointInPolygon = (point, polygon) => {
                let inside = false;
                for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                  const xi = polygon[i].x, yi = polygon[i].y;
                  const xj = polygon[j].x, yj = polygon[j].y;
                  if (((yi > point.y) !== (yj > point.y)) &&
                      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
                    inside = !inside;
                  }
                }
                return inside;
              };

              const lineIntersectsPolygon = (p1, p2, polygon) => {
                const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                if (pointInPolygon(mid, polygon)) return true;
                const q1 = { x: (p1.x + mid.x) / 2, y: (p1.y + mid.y) / 2 };
                const q3 = { x: (mid.x + p2.x) / 2, y: (mid.y + p2.y) / 2 };
                if (pointInPolygon(q1, polygon) || pointInPolygon(q3, polygon)) return true;
                return false;
              };

              const objectHulls = objects.map(obj => {
                if (obj.nodeIds.length < 1) return null;
                const objNodes = obj.nodeIds.map(id => nodes.find(n => n.id === id)).filter(Boolean);
                if (objNodes.length === 0) return null;

                const padding = 12;
                const getNodeWidth = (node) => Math.max(50, node.label.replace(/^SU\s*/i, '').length * 9 + 30);
                const nodeHeight = 28;

                const points = [];
                objNodes.forEach(node => {
                  const w = getNodeWidth(node);
                  points.push({ x: node.x - padding, y: node.y - padding });
                  points.push({ x: node.x + w + padding, y: node.y - padding });
                  points.push({ x: node.x + w + padding, y: node.y + nodeHeight + padding });
                  points.push({ x: node.x - padding, y: node.y + nodeHeight + padding });
                });

                const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
                const sortedPoints = [...points].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
                
                const lower = [];
                for (const p of sortedPoints) {
                  while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
                  lower.push(p);
                }
                const upper = [];
                for (let i = sortedPoints.length - 1; i >= 0; i--) {
                  const p = sortedPoints[i];
                  while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
                  upper.push(p);
                }
                lower.pop();
                upper.pop();
                const hull = [...lower, ...upper];
                if (hull.length < 3) return null;
                return { obj, hull, nodeIds: new Set(obj.nodeIds) };
              }).filter(Boolean);

              const isEdgeThroughForeignHull = (edge) => {
                const sourceNode = nodes.find(n => n.id === edge.source);
                const targetNode = nodes.find(n => n.id === edge.target);
                if (!sourceNode || !targetNode) return false;

                const sourceWidth = Math.max(50, sourceNode.label.replace(/^SU\s*/i, '').length * 9 + 30);
                const targetWidth = Math.max(50, targetNode.label.replace(/^SU\s*/i, '').length * 9 + 30);
                const nodeHeight = 28;

                const startX = sourceNode.x + sourceWidth / 2;
                const startY = sourceNode.y + nodeHeight;
                const endX = targetNode.x + targetWidth / 2;
                const endY = targetNode.y;
                const midY = startY + (endY - startY) / 2;

                const edgePoints = Math.abs(startX - endX) > 5
                  ? [{ x: startX, y: startY }, { x: startX, y: midY }, { x: endX, y: midY }, { x: endX, y: endY }]
                  : [{ x: startX, y: startY }, { x: endX, y: endY }];

                for (const { hull, nodeIds } of objectHulls) {
                  if (nodeIds.has(edge.source) || nodeIds.has(edge.target)) continue;
                  for (let i = 0; i < edgePoints.length - 1; i++) {
                    if (lineIntersectsPolygon(edgePoints[i], edgePoints[i + 1], hull)) return true;
                  }
                }
                return false;
              };

              return edges.filter(edge => !isEdgeThroughForeignHull(edge)).map(edge => {
                const sourceNode = nodes.find(n => n.id === edge.source);
                const targetNode = nodes.find(n => n.id === edge.target);
                if (!sourceNode || !targetNode) return null;

                const sourceLabel = sourceNode.label.replace(/^SU\s*/i, '');
                const targetLabel = targetNode.label.replace(/^SU\s*/i, '');
                const sourceWidth = Math.max(50, sourceLabel.length * 9 + 30);
                const targetWidth = Math.max(50, targetLabel.length * 9 + 30);
                const nodeHeight = 28;

                const startX = sourceNode.x + sourceWidth / 2;
                const startY = sourceNode.y + nodeHeight;
                const endX = targetNode.x + targetWidth / 2;
                const endY = targetNode.y;
                const midY = startY + (endY - startY) / 2;
                const needsDetour = Math.abs(startX - endX) > 5;

                const pathD = needsDetour
                  ? `M ${startX} ${startY} L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`
                  : `M ${startX} ${startY} L ${endX} ${endY}`;

                const arrowSize = 5;

                return (
                  <g key={edge.id}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                      onClick={(e) => handleEdgeClick(e, edge.id)}
                      style={{ cursor: 'pointer' }}
                    />
                    <path
                      d={pathD}
                      fill="none"
                      stroke={selectedEdge === edge.id ? '#3b82f6' : '#666'}
                      strokeWidth={selectedEdge === edge.id ? 2.5 : 1}
                      onClick={(e) => handleEdgeClick(e, edge.id)}
                      className="hover:stroke-blue-400"
                      style={{ cursor: 'pointer' }}
                    />
                    <polygon
                      points={`${endX},${endY} ${endX - arrowSize},${endY - arrowSize * 1.5} ${endX + arrowSize},${endY - arrowSize * 1.5}`}
                      fill={selectedEdge === edge.id ? '#3b82f6' : '#666'}
                      onClick={(e) => handleEdgeClick(e, edge.id)}
                      style={{ cursor: 'pointer' }}
                    />
                  </g>
                );
              });
            })()}

            {/* Connecting line preview */}
            {connecting && (() => {
              const sourceNode = nodes.find(n => n.id === connecting);
              if (!sourceNode) return null;
              const sourceLabel = sourceNode.label.replace(/^SU\s*/i, '');
              const sourceWidth = Math.max(50, sourceLabel.length * 9 + 30);
              const nodeHeight = 28;
              const startX = sourceNode.x + sourceWidth / 2;
              const startY = sourceNode.y + nodeHeight;
              const midY = startY + (mousePos.y - startY) / 2;
              const needsDetour = Math.abs(startX - mousePos.x) > 5;
              
              const pathD = needsDetour
                ? `M ${startX} ${startY} L ${startX} ${midY} L ${mousePos.x} ${midY} L ${mousePos.x} ${mousePos.y}`
                : `M ${startX} ${startY} L ${mousePos.x} ${mousePos.y}`;
              
              return (
                <path
                  d={pathD}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  strokeDasharray="4,4"
                />
              );
            })()}

            {/* Nodes */}
            {nodes.map(node => {
              const typeStyle = nodeTypees[node.type] || nodeTypees.other;
              const isCircle = typeStyle.shape === 'circle';
              const isSelected = selectedNode === node.id || selectedNodes.has(node.id);
              const phaseInfo = getPhaseById(node.phase);
              // Validation highlight
              const validationSeverity = validationResults && showValidation
                ? validationResults.issues.reduce((worst, issue) => {
                    if (issue.nodeIds.includes(node.id)) {
                      if (issue.severity === 'error') return 'error';
                      if (issue.severity === 'warning' && worst !== 'error') return 'warning';
                    }
                    return worst;
                  }, null)
                : null;
              const validationColor = validationSeverity === 'error' ? '#ef4444' : validationSeverity === 'warning' ? '#f59e0b' : null;
              // Remove "SU " prefix for display
              const displayLabel = node.label.replace(/^SU\s*/i, '');
              // Calculate width based on label length (+ space for symbol)
              const nodeWidth = Math.max(50, displayLabel.length * 9 + 30);
              const nodeHeight = 28;
              
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                  onMouseUp={(e) => handleNodeMouseUp(e, node.id)}
                  style={{ cursor: draggingNode === node.id ? 'grabbing' : 'grab' }}
                >
                  {/* Flash ring for return-to-selected-node effect (2s blue pulse) */}
                  {flashingNode === node.id && (
                    isCircle ? (
                      <ellipse
                        cx={nodeWidth / 2}
                        cy={nodeHeight / 2}
                        rx={nodeWidth / 2 + 10}
                        ry={nodeHeight / 2 + 10}
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth={4}
                        opacity={0.8}
                      >
                        <animate attributeName="stroke-width" values="4;8;4" dur="0.5s" repeatCount="4" />
                        <animate attributeName="opacity" values="0.8;0.3;0.8" dur="0.5s" repeatCount="4" />
                        <animate attributeName="r" values="0;5;0" dur="0.5s" repeatCount="4" additive="sum" />
                      </ellipse>
                    ) : (
                      <rect
                        x={-10}
                        y={-10}
                        width={nodeWidth + 20}
                        height={nodeHeight + 20}
                        rx={8}
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth={4}
                        opacity={0.8}
                      >
                        <animate attributeName="stroke-width" values="4;8;4" dur="0.5s" repeatCount="4" />
                        <animate attributeName="opacity" values="0.8;0.3;0.8" dur="0.5s" repeatCount="4" />
                      </rect>
                    )
                  )}
                  {/* Highlight ring for hovered node from stratigraphy panel */}
                  {highlightedNode === node.id && (
                    isCircle ? (
                      <ellipse
                        cx={nodeWidth / 2}
                        cy={nodeHeight / 2}
                        rx={nodeWidth / 2 + 8}
                        ry={nodeHeight / 2 + 8}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth={3}
                        opacity={0.9}
                      >
                        <animate attributeName="stroke-width" values="3;6;3" dur="0.8s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.9;0.4;0.9" dur="0.8s" repeatCount="indefinite" />
                      </ellipse>
                    ) : (
                      <rect
                        x={-8}
                        y={-8}
                        width={nodeWidth + 16}
                        height={nodeHeight + 16}
                        rx={6}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth={3}
                        opacity={0.9}
                      >
                        <animate attributeName="stroke-width" values="3;6;3" dur="0.8s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.9;0.4;0.9" dur="0.8s" repeatCount="indefinite" />
                      </rect>
                    )
                  )}
                  {/* Validation highlight ring */}
                  {validationColor && (
                    isCircle ? (
                      <ellipse
                        cx={nodeWidth / 2}
                        cy={nodeHeight / 2}
                        rx={nodeWidth / 2 + 4}
                        ry={nodeHeight / 2 + 4}
                        fill="none"
                        stroke={validationColor}
                        strokeWidth={2.5}
                        strokeDasharray="4,2"
                        opacity={0.8}
                      />
                    ) : (
                      <rect
                        x={-4}
                        y={-4}
                        width={nodeWidth + 8}
                        height={nodeHeight + 8}
                        rx={5}
                        fill="none"
                        stroke={validationColor}
                        strokeWidth={2.5}
                        strokeDasharray="4,2"
                        opacity={0.8}
                      />
                    )
                  )}
                  {isCircle ? (
                    <ellipse
                      cx={nodeWidth / 2}
                      cy={nodeHeight / 2}
                      rx={nodeWidth / 2}
                      ry={nodeHeight / 2}
                      fill={isSelected ? '#e0e7ff' : typeStyle.color}
                      stroke={isSelected ? '#4f46e5' : typeStyle.border}
                      strokeWidth={isSelected ? 2 : 1.5}
                    />
                  ) : (
                    <rect
                      width={nodeWidth}
                      height={nodeHeight}
                      rx={3}
                      fill={isSelected ? '#e0e7ff' : typeStyle.color}
                      stroke={isSelected ? '#4f46e5' : typeStyle.border}
                      strokeWidth={isSelected ? 2 : 1.5}
                    />
                  )}
                  {/* Typee symbol */}
                  <text
                    x={8}
                    y={nodeHeight / 2 + 4}
                    fontSize={12}
                    fill={typeStyle.border}
                  >
                    {typeStyle.symbol}
                  </text>
                  {/* Label */}
                  <text
                    x={nodeWidth / 2 + 6}
                    y={nodeHeight / 2 + 4}
                    textAnchor="middle"
                    fontSize={12}
                    fontWeight="bold"
                    fill="#333"
                  >
                    {displayLabel}
                  </text>
                  {/* Geodata indicator */}
                  {node.geometry && (
                    <circle
                      cx={nodeWidth - 6}
                      cy={6}
                      r={3.5}
                      fill="#06b6d4"
                      stroke="#fff"
                      strokeWidth={1}
                    >
                      <title>Has geometry</title>
                    </circle>
                  )}
                </g>
              );
            })}
            {/* Selection Rectangle */}
            {selectionRect && (
              <rect
                x={selectionRect.x}
                y={selectionRect.y}
                width={selectionRect.width}
                height={selectionRect.height}
                fill="rgba(99, 102, 241, 0.1)"
                stroke="#6366f1"
                strokeWidth={1}
                strokeDasharray="5,5"
              />
            )}
          </g>

          {/* Instructions */}
          <text x={10} y={20} fontSize={12} fill="#888">
            Double click: New unit | Shift+Drag: Connect | Ctrl+Drag: Multi-select | Scroll: Zoom | Ctrl+Z/Y: Undo/Redo
          </text>
        </svg>
        </div>

        {/* Map Panel (split view - native SVG) */}
        {showMapPanel && (
          <div className="w-1/2 border-l-2 border-gray-400 flex flex-col" style={{ background: '#1a1a2e' }}>
            <div className="flex items-center gap-3 px-3 py-1.5 border-b border-gray-700" style={{ background: '#16213e' }}>
              <span className="text-xs font-bold" style={{ color: '#8be9fd' }}>Map View</span>
              <span className="text-xs text-gray-500">{geoNodes.length} features</span>
              <button
                onClick={resetMapView}
                className="text-xs px-2 py-0.5 rounded"
                style={{ background: '#334', color: '#ccc' }}
              >
                Fit
              </button>
            </div>
            <svg
              ref={mapSvgRef}
              className="flex-1"
              style={{ cursor: 'grab' }}
              viewBox={mapViewBox ? `${mapViewBox.x} ${mapViewBox.y} ${mapViewBox.w} ${mapViewBox.h}` : '0 0 100 100'}
              onWheel={handleMapWheel}
              onMouseDown={handleMapMouseDown}
              onMouseMove={handleMapMouseMove}
              onMouseUp={handleMapMouseUp}
              onMouseLeave={handleMapMouseUp}
            >
              <rect x={mapViewBox?.x || 0} y={mapViewBox?.y || 0} width={mapViewBox?.w || 100} height={mapViewBox?.h || 100} fill="#1a1a2e" />
              {geoNodes.length === 0 && (
                <text x="50" y="50" textAnchor="middle" fontSize="4" fill="#556">
                  No geometries. Import GeoJSON first.
                </text>
              )}
              {geoNodes.map(n => {
                const d = geoToPath(n.geometry);
                const isSel = n.id === mapSelectedId;
                return (
                  <path
                    key={n.id}
                    d={d}
                    fill="none"
                    stroke={isSel ? '#ffffff' : n.phaseColor}
                    strokeWidth={isSel ? 0.15 : 0.08}
                    style={{ cursor: 'pointer', filter: isSel ? 'drop-shadow(0 0 0.3px rgba(255,255,255,0.7))' : 'none' }}
                    onClick={(e) => { e.stopPropagation(); handleMapNodeClick(n.id); }}
                  />
                );
              })}
              {geoNodes.map(n => {
                const c = geoCentroid(n.geometry);
                return (
                  <text
                    key={`lbl-${n.id}`}
                    x={c[0]}
                    y={c[1]}
                    textAnchor="middle"
                    fontSize={0.5}
                    fontWeight="bold"
                    fill="#ffffff"
                    style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.5)', strokeWidth: 0.12 }}
                  >
                    {n.label.replace(/^SU\s*/i, '')}
                  </text>
                );
              })}
            </svg>
          </div>
        )}

        {/* Phase Manager Panel */}
        {showPhaseManager && (
          <div className="w-64 bg-white border-l border-gray-300 p-4 overflow-y-auto">
            <h2 className="font-bold text-lg mb-4">Phase Manager</h2>
            <div className="space-y-1">
              {phases.map((phase, index) => (
                <div
                  key={phase.id}
                  draggable
                  onDragStart={(e) => {
                    setPhaseDragState({ dragging: index, over: null });
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (phaseDragState.over !== index) {
                      setPhaseDragState(prev => ({ ...prev, over: index }));
                    }
                  }}
                  onDragLeave={() => {
                    setPhaseDragState(prev => prev.over === index ? { ...prev, over: null } : prev);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (phaseDragState.dragging !== null && phaseDragState.dragging !== index) {
                      reorderPhases(phaseDragState.dragging, index);
                    }
                    setPhaseDragState({ dragging: null, over: null });
                  }}
                  onDragEnd={() => {
                    setPhaseDragState({ dragging: null, over: null });
                  }}
                  className={`flex items-center gap-2 p-2 rounded border-2 transition-all ${
                    phaseDragState.dragging === index
                      ? 'opacity-40 border-dashed border-gray-400 bg-gray-100'
                      : phaseDragState.over === index
                        ? 'border-indigo-400 bg-indigo-50'
                        : 'border-transparent bg-gray-50 hover:bg-gray-100'
                  }`}
                  style={{ cursor: 'grab' }}
                >
                  <span className="text-gray-400 cursor-grab select-none" title="Drag to reorder">⠿</span>
                  <input
                    type="color"
                    value={phase.color}
                    onFocus={onFieldFocus}
                    onChange={(e) => updatePhaseColor(phase.id, e.target.value)}
                    className="w-7 h-7 rounded cursor-pointer border-0"
                  />
                  <input
                    type="text"
                    value={phase.name}
                    onFocus={onFieldFocus}
                    onChange={(e) => updatePhaseName(phase.id, e.target.value)}
                    className="flex-1 px-2 py-1 border rounded text-sm min-w-0"
                    style={{ cursor: 'text' }}
                    draggable={false}
                  />
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    ({nodes.filter(n => n.phase === phase.id).length})
                  </span>
                  <button
                    onClick={() => deletePhase(phase.id)}
                    className="text-red-500 hover:text-red-700 flex-shrink-0"
                    title="Delete phase"
                    draggable={false}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={addPhase}
                className="w-full py-2 border-2 border-dashed border-gray-300 rounded text-gray-500 hover:border-indigo-400 hover:text-indigo-600"
              >
                + New Phase
              </button>
            </div>
            <div className="mt-4 pt-4 border-t">
              <h3 className="font-medium text-sm text-gray-700 mb-2">Tips</h3>
              <ul className="text-xs text-gray-500 space-y-1">
                <li>• Drag ⠿ to reorder phases</li>
                <li>• Ctrl + Click: Select individual</li>
                <li>• Ctrl + Drag: Rectangle selection</li>
                <li>• Then click Phases button</li>
              </ul>
            </div>
          </div>
        )}

        {/* Layout Settings Panel */}
        {showLayoutSettings && (
          <div className="w-64 bg-white border-l border-gray-300 p-4 overflow-y-auto">
            <h2 className="font-bold text-lg mb-4">Layout Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Units per row: {layoutSettings.nodesPerRow}
                </label>
                <input
                  type="range"
                  min="5"
                  max="30"
                  value={layoutSettings.nodesPerRow}
                  onChange={(e) => setLayoutSettings(prev => ({ ...prev, nodesPerRow: parseInt(e.target.value) }))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>5</span>
                  <span>30</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Horizontal gap: {layoutSettings.horizontalGap}px
                </label>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={layoutSettings.horizontalGap}
                  onChange={(e) => setLayoutSettings(prev => ({ ...prev, horizontalGap: parseInt(e.target.value) }))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>5</span>
                  <span>50</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vertical gap: {layoutSettings.verticalGap}px
                </label>
                <input
                  type="range"
                  min="20"
                  max="100"
                  value={layoutSettings.verticalGap}
                  onChange={(e) => setLayoutSettings(prev => ({ ...prev, verticalGap: parseInt(e.target.value) }))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>20</span>
                  <span>100</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phase gap: {layoutSettings.phaseGap}px
                </label>
                <input
                  type="range"
                  min="30"
                  max="150"
                  value={layoutSettings.phaseGap}
                  onChange={(e) => setLayoutSettings(prev => ({ ...prev, phaseGap: parseInt(e.target.value) }))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>30</span>
                  <span>150</span>
                </div>
              </div>
              <button
                onClick={autoLayoutByPhase}
                className="w-full py-2 bg-teal-500 text-white rounded hover:bg-teal-600"
              >
                ⚡ Apply layout
              </button>
              <div className="pt-2 border-t">
                <button
                  onClick={() => setLayoutSettings({
                    nodesPerRow: 15,
                    horizontalGap: 20,
                    verticalGap: 50,
                    phaseGap: 70
                  })}
                  className="w-full py-1 text-sm text-gray-500 hover:text-gray-700"
                >
                  Reset to defaults
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Object Manager Panel */}
        {showObjectManager && (
          <div className="w-72 bg-white border-l border-gray-300 p-4 overflow-y-auto">
            <h2 className="font-bold text-lg mb-2">Object Manager</h2>
            {/* Filter input */}
            <div className="mb-3">
              <div className="relative">
                <input
                  type="text"
                  value={objectFilter}
                  onChange={(e) => setObjectFilter(e.target.value)}
                  placeholder="Filter objects..."
                  className="w-full px-3 py-1.5 pl-8 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                {objectFilter && (
                  <button
                    onClick={() => setObjectFilter('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                )}
              </div>
              {objectFilter && (
                <div className="text-xs text-gray-500 mt-1">
                  {objects.filter(obj => obj.name.toLowerCase().includes(objectFilter.toLowerCase())).length} of {objects.length} objects
                </div>
              )}
            </div>
            <div className="space-y-2">
              {objects
                .filter(obj => obj.name.toLowerCase().includes(objectFilter.toLowerCase()))
                .map(obj => {
                const isExpanded = selectedObject === obj.id;
                return (
                  <div 
                    key={obj.id} 
                    className={`rounded border-2 transition-colors ${isExpanded ? 'border-violet-500 bg-violet-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100'}`}
                  >
                    {/* Collapsed header - always visible */}
                    <div 
                      className="p-2 cursor-pointer flex items-center gap-2"
                      onClick={() => navigateToObject(obj.id)}
                      title="Click to zoom and expand"
                    >
                      <span 
                        className="w-4 h-4 rounded flex-shrink-0" 
                        style={{ backgroundColor: obj.color }}
                      />
                      <span className="flex-1 text-sm font-medium truncate">{obj.name}</span>
                      <span className="text-xs text-gray-400">
                        {obj.nodeIds.length} unit{obj.nodeIds.length !== 1 ? 's' : ''}
                      </span>
                      <span className={`text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                    </div>
                    
                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="px-3 pb-3 border-t border-gray-200">
                        {/* Editable name and color */}
                        <div className="flex items-center gap-2 mt-2 mb-2">
                          <input
                            type="color"
                            value={obj.color}
                            onFocus={onFieldFocus}
                            onChange={(e) => updateObjectColor(obj.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-6 h-6 rounded cursor-pointer border-0"
                          />
                          <input
                            type="text"
                            value={obj.name}
                            onFocus={onFieldFocus}
                            onChange={(e) => updateObjectName(obj.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 px-2 py-1 border rounded text-sm font-medium"
                          />
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteObject(obj.id); }}
                            className="text-red-500 hover:text-red-700 text-sm"
                            title="Delete object"
                          >
                            ✕
                          </button>
                        </div>
                        
                        {/* Node list */}
                        {obj.nodeIds.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {obj.nodeIds.map(nodeId => {
                              const node = nodes.find(n => n.id === nodeId);
                              if (!node) return null;
                              return (
                                <span
                                  key={nodeId}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-white"
                                  style={{ backgroundColor: obj.color }}
                                >
                                  {node.label.replace(/^SU\s*/i, '')}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); removeNodeFromObject(obj.id, nodeId); }}
                                    className="hover:text-red-200"
                                  >
                                    ×
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        )}
                        
                        {/* Action buttons */}
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); selectObjectNodes(obj.id); }}
                            className="flex-1 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300"
                            title="Select all units of this object"
                          >
                            Select
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); addNodesToObject(obj.id); }}
                            disabled={selectedNodes.size === 0 && !selectedNode}
                            className="flex-1 py-1 text-xs bg-violet-500 text-white rounded hover:bg-violet-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                            title="Add selected units"
                          >
                            + Add
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              
              <button
                onClick={addObject}
                className="w-full py-2 border-2 border-dashed border-gray-300 rounded text-gray-500 hover:border-violet-400 hover:text-violet-600"
              >
                + New Object
              </button>
            </div>
            
            <div className="mt-4 pt-4 border-t">
              <h3 className="font-medium text-sm text-gray-700 mb-2">Tips</h3>
              <ul className="text-xs text-gray-500 space-y-1">
                <li>• Click object to zoom & expand</li>
                <li>• Select units on canvas (Ctrl+Click)</li>
                <li>• Use "Add" to assign selection</li>
              </ul>
            </div>
          </div>
        )}

        {/* Validation Panel */}
        {showValidation && validationResults && (
          <div className="w-80 bg-white border-l border-gray-300 flex flex-col overflow-hidden" style={{ maxHeight: '100%' }}>
            <div className="p-4 border-b bg-gray-50 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-lg">Validation</h2>
                <button
                  onClick={() => setShowValidation(false)}
                  className="text-gray-400 hover:text-gray-600 text-lg"
                >
                  ✕
                </button>
              </div>
              {/* Summary badges */}
              <div className="flex gap-2 mb-2">
                {validationResults.counts.error > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    {validationResults.counts.error} Error{validationResults.counts.error !== 1 ? 's' : ''}
                  </span>
                )}
                {validationResults.counts.warning > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    {validationResults.counts.warning} Warning{validationResults.counts.warning !== 1 ? 's' : ''}
                  </span>
                )}
                {validationResults.counts.info > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    {validationResults.counts.info} Info
                  </span>
                )}
              </div>
              {validationResults.issues.length === 0 && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <span className="text-green-600 text-xl">✓</span>
                  <div>
                    <div className="font-medium text-green-800 text-sm">Stratigraphy valid</div>
                    <div className="text-green-600 text-xs">No issues found. {nodes.length} units, {edges.length} relations checked.</div>
                  </div>
                </div>
              )}
              <button
                onClick={validateStratigraphy}
                className="mt-2 w-full py-1.5 text-xs bg-gray-200 rounded hover:bg-gray-300 text-gray-700"
              >
                ↻ Re-run validation
              </button>
            </div>
            {/* Issue list */}
            <div className="flex-1 overflow-y-auto p-2">
              {validationResults.issues.map((issue, idx) => {
                const severityStyles = {
                  error: { bg: 'bg-red-50', border: 'border-red-200', icon: '✗', iconColor: 'text-red-500', titleColor: 'text-red-800' },
                  warning: { bg: 'bg-amber-50', border: 'border-amber-200', icon: '⚠', iconColor: 'text-amber-500', titleColor: 'text-amber-800' },
                  info: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'ℹ', iconColor: 'text-blue-500', titleColor: 'text-blue-800' },
                };
                const s = severityStyles[issue.severity];
                return (
                  <div
                    key={idx}
                    className={`mb-2 p-3 rounded-lg border ${s.bg} ${s.border} cursor-pointer hover:shadow-sm transition-shadow`}
                    onClick={() => {
                      if (issue.nodeIds && issue.nodeIds.length > 0) {
                        const firstNode = nodes.find(n => n.id === issue.nodeIds[0]);
                        if (firstNode) {
                          navigateToNode(firstNode);
                        }
                        if (issue.nodeIds.length > 1) {
                          setSelectedNodes(new Set(issue.nodeIds));
                          setSelectedNode(null);
                        } else {
                          setSelectedNode(issue.nodeIds[0]);
                          setSelectedNodes(new Set());
                        }
                        if (issue.edgeId) {
                          setSelectedEdge(issue.edgeId);
                        }
                      }
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`${s.iconColor} text-base flex-shrink-0 mt-0.5`}>{s.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium text-sm ${s.titleColor} break-words`}>
                          {issue.message}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">{issue.description}</div>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {issue.nodeIds.map(id => {
                            const n = nodes.find(nd => nd.id === id);
                            if (!n) return null;
                            const phase = phases.find(p => p.id === n.phase);
                            return (
                              <span
                                key={id}
                                className="inline-block px-1.5 py-0.5 rounded text-xs font-medium"
                                style={{
                                  backgroundColor: phase ? `${phase.color}20` : '#f3f4f6',
                                  color: phase ? phase.color : '#6b7280',
                                  border: `1px solid ${phase ? `${phase.color}40` : '#d1d5db'}`
                                }}
                              >
                                {n.label}
                              </span>
                            );
                          })}
                          <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-500">
                            {issue.type.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Properties Panel */}
        {selectedNode && (
          <div className="w-72 bg-white border-l border-gray-300 p-4 overflow-y-auto">
            <h2 className="font-bold text-lg mb-4">Properties</h2>
            {(() => {
              const node = nodes.find(n => n.id === selectedNode);
              if (!node) return null;
              const typeStyle = nodeTypees[node.type] || nodeTypees.other;
              return (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Unit label
                    </label>
                    <input
                      type="text"
                      value={node.label}
                      onFocus={onFieldFocus}
                      onChange={(e) => updateNodeLabel(node.id, e.target.value)}
                      className={`w-full px-2 py-1 border rounded ${isLabelDuplicate(node.label, node.id) ? 'border-red-500 bg-red-50' : ''}`}
                    />
                    {isLabelDuplicate(node.label, node.id) && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-red-600">
                        <span>⚠</span>
                        <span>Duplicate label – another unit has this name</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={node.description}
                      onFocus={onFieldFocus}
                      onChange={(e) => updateNodeDescription(node.id, e.target.value)}
                      className="w-full px-2 py-1 border rounded"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Unit type
                    </label>
                    <select
                      value={node.type}
                      onChange={(e) => updateNodeTypee(node.id, e.target.value)}
                      className="w-full px-2 py-1 border rounded"
                      style={{ backgroundColor: typeStyle.color }}
                    >
                      {Object.entries(nodeTypees).map(([key, val]) => (
                        <option key={key} value={key}>{val.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phase
                    </label>
                    <div className="flex gap-1 flex-wrap">
                      {phases.map(phase => (
                        <button
                          key={phase.id}
                          onClick={() => updateNodePhase(node.id, phase.id)}
                          className={`w-8 h-8 rounded text-white text-xs font-bold hover:scale-110 transition-transform ${node.phase === phase.id ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
                          style={{ backgroundColor: phase.color }}
                          title={phase.name}
                        >
                          {phase.id}
                        </button>
                      ))}
                      <button
                        onClick={() => updateNodePhase(node.id, '')}
                        className={`w-8 h-8 rounded bg-gray-200 text-gray-500 text-xs hover:bg-gray-300 ${!node.phase ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
                        title="No Phase"
                      >
                        –
                      </button>
                    </div>
                  </div>
                  <div className="border-t pt-4">
                    <h3 className="font-medium text-sm text-gray-700 mb-2">Stratigraphy</h3>
                    <div className="text-sm text-gray-600 space-y-2">
                      <div>
                        <span className="font-medium">Above:</span>
                        <div className="ml-2">
                          {edges.filter(e => e.source === node.id).map(e => {
                            const targetNode = nodes.find(n => n.id === e.target);
                            if (!targetNode) return null;
                            const targetPhase = phases.find(p => p.id === targetNode.phase);
                            return (
                              <span
                                key={e.id}
                                className="inline-block bg-gray-100 px-2 py-0.5 rounded mr-1 mb-1 cursor-pointer hover:bg-blue-100 hover:ring-2 hover:ring-blue-300 transition-all"
                                style={targetPhase ? { borderLeft: `3px solid ${targetPhase.color}` } : {}}
                                onClick={() => setSelectedNode(targetNode.id)}
                                onMouseEnter={() => highlightAndPanToNode(targetNode.id, true)}
                                onMouseLeave={() => clearHighlightAndReturn()}
                                title={`Click to select, hover to highlight${targetPhase ? ` (${targetPhase.name})` : ''}`}
                              >
                                {targetNode.label}
                              </span>
                            );
                          })}
                          {edges.filter(e => e.source === node.id).length === 0 && (
                            <span className="text-gray-400 italic">none</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="font-medium">Below:</span>
                        <div className="ml-2">
                          {edges.filter(e => e.target === node.id).map(e => {
                            const sourceNode = nodes.find(n => n.id === e.source);
                            if (!sourceNode) return null;
                            const sourcePhase = phases.find(p => p.id === sourceNode.phase);
                            return (
                              <span
                                key={e.id}
                                className="inline-block bg-gray-100 px-2 py-0.5 rounded mr-1 mb-1 cursor-pointer hover:bg-blue-100 hover:ring-2 hover:ring-blue-300 transition-all"
                                style={sourcePhase ? { borderLeft: `3px solid ${sourcePhase.color}` } : {}}
                                onClick={() => setSelectedNode(sourceNode.id)}
                                onMouseEnter={() => highlightAndPanToNode(sourceNode.id, true)}
                                onMouseLeave={() => clearHighlightAndReturn()}
                                title={`Click to select, hover to highlight${sourcePhase ? ` (${sourcePhase.name})` : ''}`}
                              >
                                {sourceNode.label}
                              </span>
                            );
                          })}
                          {edges.filter(e => e.target === node.id).length === 0 && (
                            <span className="text-gray-400 italic">none</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="border-t pt-4">
                    <h3 className="font-medium text-sm text-gray-700 mb-2">Objects</h3>
                    {(() => {
                      const nodeObjs = getObjectsForNode(node.id);
                      if (nodeObjs.length === 0) {
                        return <div className="text-sm text-gray-400 italic">Not assigned to any object</div>;
                      }
                      return (
                        <div className="space-y-1">
                          {nodeObjs.map(obj => (
                            <div key={obj.id} className="flex items-center gap-2 text-sm">
                              <span
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: obj.color }}
                              />
                              <span className="flex-1 truncate">{obj.name}</span>
                              <button
                                onClick={() => removeNodeFromObject(obj.id, node.id)}
                                className="text-red-400 hover:text-red-600 text-xs flex-shrink-0"
                                title={`Remove from ${obj.name}`}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="border-t pt-4">
                    <h3 className="font-medium text-sm text-gray-700 mb-2">Geodata</h3>
                    {node.geometry ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-cyan-500 inline-block" />
                          <span className="text-sm text-gray-600">{node.geometry.type}</span>
                        </div>
                        <button
                          onClick={() => {
                            pushUndo();
                            setNodes(prev => prev.map(n => n.id === node.id ? { ...n, geometry: undefined } : n));
                          }}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Remove geometry
                        </button>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-400 italic">No geometry linked</div>
                    )}
                  </div>
                  <div className="border-t pt-4">
                    <h3 className="font-medium text-sm text-gray-700 mb-2">Legend</h3>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      {Object.entries(nodeTypees).map(([key, val]) => (
                        <div key={key} className="flex items-center gap-1">
                          <span style={{ color: val.border }} className="w-4 text-center">{val.symbol}</span>
                          {val.shape === 'circle' ? (
                            <div 
                              className="w-5 h-3 rounded-full" 
                              style={{ backgroundColor: val.color, border: `1px solid ${val.border}` }}
                            />
                          ) : (
                            <div 
                              className="w-4 h-4 rounded" 
                              style={{ backgroundColor: val.color, border: `1px solid ${val.border}` }}
                            />
                          )}
                          <span>{val.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="bg-gray-200 border-t border-gray-300 px-4 py-1 text-sm text-gray-600 flex justify-between items-center">
        {/* Left: Statistics */}
        <span className="flex-shrink-0">
          {nodes.length} Units | {edges.length} Relations | {phases.length} Phases | {objects.length} Objects | {nodes.filter(n => n.geometry).length} Geo
          {validationResults && (
            validationResults.counts.error > 0
              ? ` | ✗ ${validationResults.counts.error} error${validationResults.counts.error !== 1 ? 's' : ''}`
              : validationResults.counts.warning > 0
              ? ` | ⚠ ${validationResults.counts.warning} warning${validationResults.counts.warning !== 1 ? 's' : ''}`
              : ' | ✓ Valid'
          )}
        </span>
        
        {/* Center: Selection details */}
        <span className="flex-1 text-center text-gray-500 px-4 truncate">
          {(() => {
            if (selectedEdge) {
              const edge = edges.find(e => e.id === selectedEdge);
              if (edge) {
                const sourceNode = nodes.find(n => n.id === edge.source);
                const targetNode = nodes.find(n => n.id === edge.target);
                if (sourceNode && targetNode) {
                  const sourcePhase = phases.find(p => p.id === sourceNode.phase);
                  const targetPhase = phases.find(p => p.id === targetNode.phase);
                  const sourceInfo = sourcePhase ? `${sourceNode.label} (${sourcePhase.name})` : sourceNode.label;
                  const targetInfo = targetPhase ? `${targetNode.label} (${targetPhase.name})` : targetNode.label;
                  return `${sourceInfo} → ${targetInfo}`;
                }
              }
            }
            if (selectedNode) {
              const node = nodes.find(n => n.id === selectedNode);
              if (node) {
                const phase = phases.find(p => p.id === node.phase);
                const nodeObjects = getObjectsForNode(node.id);
                let info = node.label;
                if (phase) info += ` | ${phase.name}`;
                if (nodeObjects.length > 0) info += ` | ${nodeObjects.map(o => o.name).join(', ')}`;
                return info;
              }
            }
            if (selectedNodes.size > 0) {
              const phaseGroups = {};
              selectedNodes.forEach(id => {
                const node = nodes.find(n => n.id === id);
                if (node) {
                  const phaseName = phases.find(p => p.id === node.phase)?.name || 'No Phase';
                  phaseGroups[phaseName] = (phaseGroups[phaseName] || 0) + 1;
                }
              });
              return Object.entries(phaseGroups).map(([p, c]) => `${c}× ${p}`).join(', ');
            }
            return '';
          })()}
        </span>
        
        {/* Right: Action hint */}
        <span className="flex-shrink-0">
          {connecting ? 'Drawing connection – click target node' : 
           selectedNodes.size > 0 ? `${selectedNodes.size} units selected – assign Phase/Object or press Del` :
           selectedNode ? 'Unit selected – press Del to delete' :
           selectedEdge ? 'Relation selected – press Del to delete' :
           'Ready'}
        </span>
      </div>

      {/* Export Modal */}
      {exportModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-3/4 max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-bold">{exportModal.title}</h3>
              <button
                onClick={() => setExportModal({ show: false, content: '', filename: '' })}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ✕
              </button>
            </div>
            <div className="p-4 flex-1 overflow-hidden flex flex-col">
              <p className="text-sm text-gray-600 mb-2">
                Filename: <code className="bg-gray-100 px-1 rounded">{exportModal.filename}</code>
              </p>
              <p className="text-sm text-gray-600 mb-2">
                Copy the contents and save to a file:
              </p>
              <textarea
                value={exportModal.content}
                readOnly
                className="flex-1 w-full p-2 border rounded font-mono text-xs bg-gray-50 resize-none"
                style={{ minHeight: '300px' }}
              />
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <button
                onClick={copyToClipboard}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                📋 Copy to clipboard
              </button>
              <button
                onClick={() => setExportModal({ show: false, content: '', filename: '' })}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GeoJSON Import Modal */}
      {geoImportModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-[520px] max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-bold">Import GeoJSON – Attribute Matching</h3>
              <button
                onClick={() => setGeoImportModal({ show: false, features: [], attributeKeys: [], selectedKey: '', preview: [] })}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ✕
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-2">
                  <strong>{geoImportModal.features.length}</strong> features found. Select which attribute to match against SU labels:
                </p>
                <select
                  value={geoImportModal.selectedKey}
                  onChange={(e) => updateGeoImportPreview(e.target.value)}
                  className="w-full px-3 py-2 border rounded text-sm"
                >
                  {geoImportModal.attributeKeys.map(k => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
              <div>
                <h4 className="font-medium text-sm text-gray-700 mb-2">Preview (first 8 features)</h4>
                <div className="border rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left px-3 py-1.5 font-medium text-gray-600">GeoJSON value</th>
                        <th className="text-left px-3 py-1.5 font-medium text-gray-600">Geometry</th>
                        <th className="text-left px-3 py-1.5 font-medium text-gray-600">Match</th>
                      </tr>
                    </thead>
                    <tbody>
                      {geoImportModal.preview.map((p, i) => {
                        const val = p.value;
                        const valNum = val.replace(/\D/g, '');
                        const matchNode = nodes.find(n => {
                          const nl = n.label.trim();
                          const nn = nl.replace(/\D/g, '');
                          if (val === nl) return true;
                          if (valNum === nn && nn !== '') return true;
                          if (val.replace(/[\s_-]/g, '').toLowerCase() === nl.replace(/[\s_-]/g, '').toLowerCase()) return true;
                          return false;
                        });
                        return (
                          <tr key={i} className={`border-t ${matchNode ? 'bg-green-50' : 'bg-red-50'}`}>
                            <td className="px-3 py-1.5 font-mono">{val || <span className="text-gray-400 italic">empty</span>}</td>
                            <td className="px-3 py-1.5 text-gray-500">{p.geomType}</td>
                            <td className="px-3 py-1.5">
                              {matchNode ? (
                                <span className="text-green-700 font-medium">→ {matchNode.label}</span>
                              ) : (
                                <span className="text-red-500 text-xs">no match</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                Matching is flexible: "SU 001", "001", "SU001", and "1" will all match. Interface units are recognized separately: "SU 107" and "SU 107IF" (or "44" vs "44-IF", "65" vs "IF65") are treated as distinct units. Try different attributes if matching is poor.
              </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <button
                onClick={() => setGeoImportModal({ show: false, features: [], attributeKeys: [], selectedKey: '', preview: [] })}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={applyGeoImport}
                className="px-4 py-2 bg-cyan-500 text-white rounded hover:bg-cyan-600"
              >
                Apply ({geoImportModal.features.length} features)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HarrisMatrixEditor;
