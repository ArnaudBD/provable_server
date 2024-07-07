"use client"; // Add this line to mark the component as a client component

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Textarea } from "@/components/ui/textarea";
import { hash as starknetHash } from "starknet";
import { createFile, updateFile, removeFile, getFileCount, getFile } from '../lib/contract';
import AlertDialog from './AlertDialog';
import React from 'react';
import Image from 'next/image';
import { fetchDocuments, saveDocument, deleteDocument, fetchDocumentDetails } from '../app/services/documentService'

function FileUpload({ onFileRead }) {
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        onFileRead(text, file.name); // Pass the file name
      };
      reader.readAsText(file);
    }
  };

  return (
    <label className="cursor-pointer">
      <UploadIcon className="h-6 w-6" />
      <input type="file" onChange={handleFileChange} className="hidden" />
    </label>
  );
}

export function Mainv0() {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [documents, setDocuments] = useState([]);
  const [currentDocId, setCurrentDocId] = useState(null);
  const [alertMessage, setAlertMessage] = useState('');
  const [transactionHash, setTransactionHash] = useState('');

  useEffect(() => {
    fetchDocuments()
      .then(setDocuments)
      .catch(error => console.error("Error fetching documents:", error));
  }, []);

  const handleSave = async () => {
    try {
      const textHash = starknetHash.starknetKeccak(text).toString();
      const prevHash = currentDocId ? documents.find(doc => doc._id === currentDocId)?.hash : null;

      const response = await saveDocument(currentDocId, { text, name, hash: textHash });

      if (response.ok) {
        const res = currentDocId
          ? await updateFile(name, prevHash, textHash)
          : await createFile(name, textHash);

        setAlertMessage(`File ${currentDocId ? 'updated' : 'created'}: ${JSON.stringify(res.transaction_hash)}`);
        setTransactionHash(res.transaction_hash);
        fetchDocuments().then(setDocuments);
      } else {
        setAlertMessage(`Error: Failed to save text ${response.statusText}`);
      }
    } catch (error) {
      setAlertMessage(`Error: ${error.message}`);
    }
  };

  const handleDelete = async (id) => {
    try {
      const docToDelete = documents.find((doc) => doc._id === id);
      const textHash = docToDelete ? starknetHash.starknetKeccak(docToDelete.text).toString() : null;

      const response = await deleteDocument(id);

      if (response.ok) {
        setDocuments((prevDocuments) => prevDocuments.filter((doc) => doc._id !== id));
        if (textHash) {
          const res = await removeFile(textHash);
          setAlertMessage(`File deleted: ${JSON.stringify(res.transaction_hash)}`);
          setTransactionHash(res.transaction_hash);
        }
      } else {
        setAlertMessage(`Error: Failed to delete document ${response.statusText}`);
      }
    } catch (error) {
      setAlertMessage(`Error: ${error.message}`);
    }
  };

  const handleDocumentClick = async (id) => {
    try {
      const data = await fetchDocumentDetails(id);
      setName(data.name);
      setText(data.text);
      setCurrentDocId(data._id);
    } catch (error) {
      setAlertMessage(`Error: ${error.message}`);
    }
  };

  const handleFileRead = (fileContent, fileName) => {
    setText(fileContent);
    setName(fileName); // Set the name state with the file name
  };

  return (
    <div className="grid min-h-screen w-full grid-cols-[240px_1fr]">
      <div className="flex flex-col border-r bg-muted/40 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Files</h2>
          <div className="flex items-center space-x-2">
            <FileUpload onFileRead={handleFileRead} />
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={() => window.location.reload()} // Add this line to refresh the page
            >
              <PlusIcon className="h-4 w-4" />
              <span className="sr-only">New File</span>
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto py-2">
          <nav className="grid gap-1">
            {documents.map((doc) => (
              <div key={doc._id} className="flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted">
                <a
                  href="#"
                  className="flex-1 truncate"
                  onClick={(e) => {
                    e.preventDefault();
                    handleDocumentClick(doc._id);
                  }}
                >
                  {doc.name}
                </a>
                <XIcon
                  className="h-4 w-4 cursor-pointer"
                  onClick={(e) => {
                    e.preventDefault();
                    handleDelete(doc._id);
                  }}
                />
              </div>
            ))}
          </nav>
        </div>
      </div>
      <div className="flex flex-col">
        <div className="flex-1 p-6">
          <Textarea
            placeholder="Enter File name"
            maxLength={20}
            className="mb-4 w-full rounded-md border border-input bg-background p-2 text-lg focus:outline-none focus:ring-1 focus:ring-primary"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Textarea
            placeholder="Start typing..."
            className="h-3/4 w-full resize-none rounded-md border border-input bg-background p-4 text-lg focus:outline-none focus:ring-1 focus:ring-primary"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {currentDocId && (
            <div className="mt-2 text-sm text-gray-500">
              Document ID: {currentDocId}
            </div>
          )}
        </div>
        <div className="border-t bg-muted/40 p-4">
          <Button className="ml-auto" onClick={handleSave}>Save</Button>
        </div>
      </div>
      <AlertDialog message={alertMessage} onClose={() => setAlertMessage('')} transactionHash={transactionHash} />
    </div>
  )
}

function PlusIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  )
}


function XIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

function UploadIcon(props) {
  return (
    <Image
      {...props}
      src="/upload-minimalistic-svgrepo-com.svg"
      alt="Upload Icon"
      width={24}
      height={24}
      style={{ filter: 'invert(1)' }}
    />
  );
}
